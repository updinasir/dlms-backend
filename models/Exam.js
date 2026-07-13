const pool = require('../config/database');

function buildExamUid(type, id) {
  return `${type === 'practical' ? 'P' : 'T'}-${id}`;
}

function parseExamUid(uid) {
  if (!uid || typeof uid !== 'string') return null;
  const parts = uid.split('-');
  if (parts.length !== 2) return null;
  const prefix = parts[0];
  const id = parseInt(parts[1], 10);
  if (Number.isNaN(id)) return null;
  if (prefix === 'P') return { type: 'practical', id };
  if (prefix === 'T') return { type: 'theory', id };
  return null;
}

function normalizeStatus(result) {
  return result == null ? 'scheduled' : 'completed';
}

class Exam {
  static async findAll(filters = {}) {
    const params = [];

    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'WHERE d.deleted_at IS NULL' : '';
    const practicalSQL = `
      SELECT
        CONCAT('P-', pe.practical_exam_id) AS exam_uid,
        'practical' AS exam_type,
        pe.practical_exam_id AS exam_id,
        pe.driver_id,
        d.first_name,
        d.last_name,
        pe.examiner_id,
        pe.exam_date,
        pe.vehicle_used,
        pe.score,
        pe.result,
        pe.remarks,
        NULL AS total_marks,
        CASE WHEN pe.result IS NULL THEN 'scheduled' ELSE 'completed' END AS status
      FROM practical_exams pe
      LEFT JOIN drivers d ON pe.driver_id = d.driver_id
      ${dFilter}
    `;

    const theorySQL = `
      SELECT
        CONCAT('T-', te.theory_exam_id) AS exam_uid,
        'theory' AS exam_type,
        te.theory_exam_id AS exam_id,
        te.driver_id,
        d.first_name,
        d.last_name,
        NULL AS examiner_id,
        te.exam_date,
        NULL AS vehicle_used,
        te.score,
        te.result,
        te.remarks,
        te.total_marks,
        CASE WHEN te.result IS NULL THEN 'scheduled' ELSE 'completed' END AS status
      FROM theory_exams te
      LEFT JOIN drivers d ON te.driver_id = d.driver_id
      ${dFilter}
    `;

    let unionSQL = `${practicalSQL} UNION ALL ${theorySQL}`;
    if (filters.type === 'practical') unionSQL = practicalSQL;
    if (filters.type === 'theory') unionSQL = theorySQL;

    const where = [];
    if (filters.search) {
      where.push(`(first_name LIKE ? OR last_name LIKE ? OR exam_uid LIKE ?)`);
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }
    if (filters.status) {
      where.push('status = ?');
      params.push(filters.status);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSQL = 'ORDER BY exam_date DESC';

    const limit = Math.min(filters.limit ? parseInt(filters.limit, 10) : 50, 100);
    const offset = filters.offset ? parseInt(filters.offset, 10) : 0;

    const sql = `SELECT * FROM (${unionSQL}) as exams ${whereSQL} ${orderSQL} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);
    return rows.map(r => ({
      exam_uid: r.exam_uid,
      exam_type: r.exam_type,
      exam_id: r.exam_id,
      driver_id: r.driver_id,
      first_name: r.first_name,
      last_name: r.last_name,
      examiner_id: r.examiner_id,
      exam_date: r.exam_date,
      vehicle_used: r.vehicle_used,
      score: r.score,
      result: r.result,
      remarks: r.remarks,
      total_marks: r.total_marks,
      status: r.status
    }));
  }

  static async findById(examUid) {
    const parsed = parseExamUid(examUid);
    if (!parsed) return null;
    if (parsed.type === 'practical') {
      const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
      const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
      const [rows] = await pool.query(
        `SELECT pe.*, d.first_name, d.last_name FROM practical_exams pe LEFT JOIN drivers d ON pe.driver_id = d.driver_id WHERE pe.practical_exam_id = ? ${dFilter}`,
        [parsed.id]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        exam_uid: buildExamUid('practical', r.practical_exam_id),
        exam_type: 'practical',
        exam_id: r.practical_exam_id,
        driver_id: r.driver_id,
        first_name: r.first_name,
        last_name: r.last_name,
        examiner_id: r.examiner_id,
        exam_date: r.exam_date,
        vehicle_used: r.vehicle_used,
        score: r.score,
        result: r.result,
        remarks: r.remarks,
        status: normalizeStatus(r.result)
      };
    }

    const [[drvCol2]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter2 = drvCol2 ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT te.*, d.first_name, d.last_name FROM theory_exams te LEFT JOIN drivers d ON te.driver_id = d.driver_id WHERE te.theory_exam_id = ? ${dFilter2}`,
      [parsed.id]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      exam_uid: buildExamUid('theory', r.theory_exam_id),
      exam_type: 'theory',
      exam_id: r.theory_exam_id,
      driver_id: r.driver_id,
      first_name: r.first_name,
      last_name: r.last_name,
      exam_date: r.exam_date,
      score: r.score,
      result: r.result,
      remarks: r.remarks,
      total_marks: r.total_marks,
      status: normalizeStatus(r.result)
    };
  }

  static async create(data) {
    if (String(data.exam_type).toLowerCase() === 'practical') {
      const payload = {
        driver_id: data.driver_id,
        examiner_id: data.examiner_id || null,
        exam_date: data.exam_date || null,
        vehicle_used: data.vehicle_used || null,
        score: data.score || null,
        result: data.result || null,
        remarks: data.remarks || null
      };
      const [res] = await pool.query('INSERT INTO practical_exams SET ?', payload);
      return this.findById(`P-${res.insertId}`);
    }

    const payload = {
      driver_id: data.driver_id,
      exam_date: data.exam_date || null,
      score: data.score || null,
      total_marks: data.total_marks || null,
      result: data.result || null,
      remarks: data.remarks || null
    };
    const [res] = await pool.query('INSERT INTO theory_exams SET ?', payload);
    return this.findById(`T-${res.insertId}`);
  }

  static async update(examUid, data) {
    const parsed = parseExamUid(examUid);
    if (!parsed) return null;

    const allowedCommonFields = ['driver_id', 'exam_date', 'score', 'result', 'remarks'];
    const allowedPracticalFields = [...allowedCommonFields, 'examiner_id', 'vehicle_used'];
    const allowedTheoryFields = [...allowedCommonFields, 'total_marks'];

    const allowedFields = parsed.type === 'practical' ? allowedPracticalFields : allowedTheoryFields;
    const updatableData = Object.fromEntries(
      Object.entries(data || {}).filter(([key]) => allowedFields.includes(key))
    );

    if (parsed.type === 'practical') {
      await pool.query('UPDATE practical_exams SET ? WHERE practical_exam_id = ?', [updatableData, parsed.id]);
      return this.findById(examUid);
    }
    await pool.query('UPDATE theory_exams SET ? WHERE theory_exam_id = ?', [updatableData, parsed.id]);
    return this.findById(examUid);
  }

  static async delete(examUid) {
    const parsed = parseExamUid(examUid);
    if (!parsed) return;
    if (parsed.type === 'practical') {
      await pool.query('DELETE FROM practical_exams WHERE practical_exam_id = ?', [parsed.id]);
      return;
    }
    await pool.query('DELETE FROM theory_exams WHERE theory_exam_id = ?', [parsed.id]);
  }

  static async submitResult(examUid, resultData) {
    const parsed = parseExamUid(examUid);
    if (!parsed) return null;
    const payload = {
      score: resultData.score || null,
      result: resultData.result || null,
      remarks: resultData.remarks || null
    };
    if (parsed.type === 'practical') {
      await pool.query('UPDATE practical_exams SET ? WHERE practical_exam_id = ?', [payload, parsed.id]);
      return this.findById(examUid);
    }
    await pool.query('UPDATE theory_exams SET ? WHERE theory_exam_id = ?', [payload, parsed.id]);
    return this.findById(examUid);
  }

  static async count(filters = {}) {
    if (filters.type === 'practical') {
      const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
      const dFilter = drvCol ? 'WHERE d.deleted_at IS NULL' : '';
      const [[row]] = await pool.query(`SELECT COUNT(*) as total FROM practical_exams pe LEFT JOIN drivers d ON pe.driver_id = d.driver_id ${dFilter}`);
      return row.total;
    }
    if (filters.type === 'theory') {
      const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
      const dFilter = drvCol ? 'WHERE d.deleted_at IS NULL' : '';
      const [[row]] = await pool.query(`SELECT COUNT(*) as total FROM theory_exams te LEFT JOIN drivers d ON te.driver_id = d.driver_id ${dFilter}`);
      return row.total;
    }
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'WHERE d.deleted_at IS NULL' : '';
    const [[row]] = await pool.query(`SELECT (SELECT COUNT(*) FROM practical_exams pe LEFT JOIN drivers d ON pe.driver_id = d.driver_id ${dFilter}) + (SELECT COUNT(*) FROM theory_exams te LEFT JOIN drivers d ON te.driver_id = d.driver_id ${dFilter}) as total`);
    return row.total;
  }

  static async getAttemptStats(driverId, examType) {
    const type = String(examType).toLowerCase();
    const table = type === 'practical' ? 'practical_exams' : 'theory_exams';
    const [[stats]] = await pool.query(
      `SELECT
         COUNT(*) AS attempts,
         SUM(CASE WHEN result = 'Fail' THEN 1 ELSE 0 END) AS fails,
         SUM(CASE WHEN result = 'Pass' THEN 1 ELSE 0 END) AS passes,
         MAX(CASE WHEN result = 'Fail' THEN exam_date END) AS last_fail_date,
         SUM(CASE WHEN result IS NULL THEN 1 ELSE 0 END) AS pending
       FROM ${table}
       WHERE driver_id = ?`,
      [driverId]
    );
    return {
      attempts: Number(stats.attempts) || 0,
      fails: Number(stats.fails) || 0,
      passes: Number(stats.passes) || 0,
      lastFailDate: stats.last_fail_date || null,
      hasPending: (Number(stats.pending) || 0) > 0
    };
  }

  static async getStatistics() {
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const dWhere = drvCol ? 'WHERE d.deleted_at IS NULL' : '';
    const [[pr_total]] = await pool.query(`SELECT COUNT(*) as count FROM practical_exams pe LEFT JOIN drivers d ON pe.driver_id = d.driver_id ${dWhere}`);
    const [[th_total]] = await pool.query(`SELECT COUNT(*) as count FROM theory_exams te LEFT JOIN drivers d ON te.driver_id = d.driver_id ${dWhere}`);
    const [[pr_passed]] = await pool.query(`SELECT COUNT(*) as count FROM practical_exams pe LEFT JOIN drivers d ON pe.driver_id = d.driver_id WHERE pe.result = 'Pass' ${dFilter}`);
    const [[pr_failed]] = await pool.query(`SELECT COUNT(*) as count FROM practical_exams pe LEFT JOIN drivers d ON pe.driver_id = d.driver_id WHERE pe.result = 'Fail' ${dFilter}`);
    const [[pr_pending]] = await pool.query(`SELECT COUNT(*) as count FROM practical_exams pe LEFT JOIN drivers d ON pe.driver_id = d.driver_id WHERE pe.result IS NULL ${dFilter}`);
    const [[th_passed]] = await pool.query(`SELECT COUNT(*) as count FROM theory_exams te LEFT JOIN drivers d ON te.driver_id = d.driver_id WHERE te.result = 'Pass' ${dFilter}`);
    const [[th_failed]] = await pool.query(`SELECT COUNT(*) as count FROM theory_exams te LEFT JOIN drivers d ON te.driver_id = d.driver_id WHERE te.result = 'Fail' ${dFilter}`);
    const [[th_pending]] = await pool.query(`SELECT COUNT(*) as count FROM theory_exams te LEFT JOIN drivers d ON te.driver_id = d.driver_id WHERE te.result IS NULL ${dFilter}`);

    const total = pr_total.count + th_total.count;
    const passed = pr_passed.count + th_passed.count;
    const failed = pr_failed.count + th_failed.count;
    const pending = pr_pending.count + th_pending.count;

    return { total, passed, failed, pending, scheduled: pending, completed: passed + failed };
  }
}

module.exports = Exam;
