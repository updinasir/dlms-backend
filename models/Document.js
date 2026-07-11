const pool = require('../config/database');

let DRV_SOFT_DELETE = { checked: false, supported: false };
const ensureDriverSoftDelete = async () => {
  if (DRV_SOFT_DELETE.checked) return DRV_SOFT_DELETE.supported;
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    DRV_SOFT_DELETE = { checked: true, supported: cols.length > 0 };
  } catch {
    DRV_SOFT_DELETE = { checked: true, supported: false };
  }
  return DRV_SOFT_DELETE.supported;
};

class Document {
  static async findAll(filters = {}) {
    const drvSoft = await ensureDriverSoftDelete();
    let query = 'SELECT doc.*, d.national_id, d.first_name, d.last_name, d.phone, d.email FROM documents doc LEFT JOIN drivers d ON doc.driver_id = d.driver_id';
    const params = [];
    const conditions = [];

    if (drvSoft) conditions.push('d.deleted_at IS NULL');

    if (filters.type) {
      conditions.push('doc.document_type = ?');
      params.push(filters.type);
    }

    if (filters.driver_id) {
      conditions.push('doc.driver_id = ?');
      params.push(filters.driver_id);
    }

    if (filters.search) {
      conditions.push('(doc.document_type LIKE ? OR d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY doc.uploaded_at DESC';

    if (filters.limit) {
      const limit = Math.min(parseInt(filters.limit), 100);
      query += ' LIMIT ?';
      params.push(limit);
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(parseInt(filters.offset));
    }

    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async findById(id) {
    const drvSoft = await ensureDriverSoftDelete();
    const dFilter = drvSoft ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT doc.*, d.national_id, d.first_name, d.last_name, d.phone, d.email FROM documents doc LEFT JOIN drivers d ON doc.driver_id = d.driver_id WHERE doc.document_id = ? ${dFilter}`,
      [id]
    );
    return rows[0];
  }

  static async create(documentData) {
    const [result] = await pool.query('INSERT INTO documents SET ?', documentData);
    return this.findById(result.insertId);
  }

  static async update(id, documentData) {
    await pool.query('UPDATE documents SET ? WHERE document_id = ?', [documentData, id]);
    return this.findById(id);
  }

  static async delete(id) {
    await pool.query('DELETE FROM documents WHERE document_id = ?', [id]);
  }

  static async findByDriverId(driverId) {
    const [rows] = await pool.query(
      'SELECT * FROM documents WHERE driver_id = ? ORDER BY uploaded_at DESC',
      [driverId]
    );
    return rows;
  }

  static async count(filters = {}) {
    const drvSoft = await ensureDriverSoftDelete();
    let query = 'SELECT COUNT(*) as total FROM documents doc LEFT JOIN drivers d ON doc.driver_id = d.driver_id';
    const params = [];
    const conditions = [];

    if (drvSoft) conditions.push('d.deleted_at IS NULL');

    if (filters.type) {
      conditions.push('doc.document_type = ?');
      params.push(filters.type);
    }

    if (filters.driver_id) {
      conditions.push('doc.driver_id = ?');
      params.push(filters.driver_id);
    }

    if (filters.search) {
      conditions.push('(doc.document_type LIKE ? OR d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }
}

module.exports = Document;
