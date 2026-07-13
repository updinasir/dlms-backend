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

const normalizeTextKey = (value) => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

const normalizeAppointmentType = (value) => {
  const key = normalizeTextKey(value);

  const map = {
    'theory exam': 'Theory Test',
    'theory test': 'Theory Test',
    'practical exam': 'Practical Test',
    'practical test': 'Practical Test',
    'license renewal': 'Renewal',
    renewal: 'Renewal',
    'document submission': 'License Collection',
    'license collection': 'License Collection'
  };

  return map[key] || value;
};

const normalizeStatus = (value) => {
  const key = normalizeTextKey(value);

  const map = {
    scheduled: 'Pending',
    pending: 'Pending',
    approved: 'Approved',
    'checked in': 'Checked In',
    checkedin: 'Checked In',
    waiting: 'Waiting',
    'in progress': 'In Progress',
    inprogress: 'In Progress',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
    completed: 'Completed',
    rescheduled: 'Rescheduled',
    'no show': 'No Show',
    noshow: 'No Show',
    expired: 'Expired'
  };

  return map[key] || value;
};

const formatAppointmentDate = (value) => {
  if (!value) return value;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    return `${text.replace('T', ' ')}:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) {
    return `${text}:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 19).replace('T', ' ');
  }

  return text;
};

const sanitizeAppointmentData = (appointmentData = {}) => {
  const payload = {};

  if (appointmentData.driver_id !== undefined) {
    payload.driver_id = appointmentData.driver_id;
  }

  if (appointmentData.appointment_type !== undefined) {
    payload.appointment_type = normalizeAppointmentType(appointmentData.appointment_type);
  }

  const dateValue = appointmentData.appointment_date ?? appointmentData.date;
  const timeValue = appointmentData.appointment_time;

  if (dateValue !== undefined) {
    const combinedValue =
      typeof dateValue === 'string' && timeValue && !dateValue.includes('T') && !dateValue.includes(' ')
        ? `${dateValue} ${String(timeValue).slice(0, 5)}:00`
        : dateValue;
    payload.appointment_date = formatAppointmentDate(combinedValue);
  }

  if (appointmentData.center_name !== undefined) {
    payload.center_name = appointmentData.center_name;
  } else if (appointmentData.location !== undefined) {
    payload.center_name = appointmentData.location;
  }

  if (appointmentData.status !== undefined) {
    payload.status = normalizeStatus(appointmentData.status);
  }

  if (appointmentData.examiner_id !== undefined) {
    payload.examiner_id = appointmentData.examiner_id || null;
  }

  if (appointmentData.room !== undefined) {
    payload.room = appointmentData.room || null;
  }

  if (appointmentData.notes !== undefined) {
    payload.notes = appointmentData.notes;
  }

  return payload;
};

const mapAppointmentRow = (row) => {
  if (!row) return row;

  return {
    ...row,
    id: row.appointment_id,
    appointment_id: row.appointment_id,
    center_name: row.center_name || row.location || null,
    location: row.center_name || row.location || null,
    examiner_name: row.examiner_name || null,
    status: normalizeStatus(row.status),
    appointment_type: normalizeAppointmentType(row.appointment_type)
  };
};

const APPT_SELECT = 'SELECT a.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city, u.full_name AS examiner_name FROM appointments a LEFT JOIN drivers d ON a.driver_id = d.driver_id LEFT JOIN users u ON a.examiner_id = u.user_id';

class Appointment {
  static async findAll(filters = {}) {
    const drvSoft = await ensureDriverSoftDelete();
    let query = APPT_SELECT;
    const params = [];
    const conditions = [];

    if (drvSoft) conditions.push('d.deleted_at IS NULL');

    if (filters.status) {
      conditions.push('a.status = ?');
      params.push(normalizeStatus(filters.status));
    }

    if (filters.type) {
      conditions.push('a.appointment_type = ?');
      params.push(normalizeAppointmentType(filters.type));
    }

    if (filters.search) {
      conditions.push('(d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (filters.date_from) {
      conditions.push('a.appointment_date >= ?');
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push('a.appointment_date <= ?');
      params.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.appointment_date ASC';

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
    return rows.map(mapAppointmentRow);
  }

  static async findById(id) {
    const drvSoft = await ensureDriverSoftDelete();
    const dFilter = drvSoft ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `${APPT_SELECT} WHERE a.appointment_id = ? ${dFilter}`,
      [id]
    );
    return mapAppointmentRow(rows[0]);
  }

  static async findByDriver(driverId) {
    const [rows] = await pool.query(
      `${APPT_SELECT} WHERE a.driver_id = ? ORDER BY a.appointment_date DESC`,
      [driverId]
    );
    return rows.map(mapAppointmentRow);
  }

  static async create(appointmentData) {
    const payload = sanitizeAppointmentData(appointmentData);
    const [result] = await pool.query('INSERT INTO appointments SET ?', payload);
    return this.findById(result.insertId);
  }

  static async update(id, appointmentData) {
    const payload = sanitizeAppointmentData(appointmentData);
    await pool.query('UPDATE appointments SET ? WHERE appointment_id = ?', [payload, id]);
    return this.findById(id);
  }

  static async delete(id) {
    await pool.query('DELETE FROM appointments WHERE appointment_id = ?', [id]);
  }

  static async cancel(id) {
    await pool.query('UPDATE appointments SET status = "Cancelled" WHERE appointment_id = ?', [id]);
    return this.findById(id);
  }

  static async complete(id) {
    await pool.query('UPDATE appointments SET status = "Completed", completed_at = NOW() WHERE appointment_id = ?', [id]);
    return this.findById(id);
  }

  static async checkIn(id) {
    await pool.query('UPDATE appointments SET status = "Checked In", checked_in_at = NOW() WHERE appointment_id = ?', [id]);
    return this.findById(id);
  }

  static async setWaiting(id) {
    await pool.query('UPDATE appointments SET status = "Waiting" WHERE appointment_id = ?', [id]);
    return this.findById(id);
  }

  static async startProgress(id) {
    await pool.query('UPDATE appointments SET status = "In Progress", started_at = NOW() WHERE appointment_id = ?', [id]);
    return this.findById(id);
  }

  static async markNoShow(id) {
    await pool.query('UPDATE appointments SET status = "No Show" WHERE appointment_id = ?', [id]);
    return this.findById(id);
  }

  static async requestReschedule(id, { reason, preferred_date }) {
    await pool.query(
      'UPDATE appointments SET reschedule_requested = 1, reschedule_reason = ?, preferred_date = ? WHERE appointment_id = ?',
      [reason || null, preferred_date ? formatAppointmentDate(preferred_date) : null, id]
    );
    return this.findById(id);
  }

  static async approveReschedule(id, newDate) {
    await pool.query(
      'UPDATE appointments SET status = "Rescheduled", appointment_date = ?, reschedule_requested = 0, preferred_date = NULL WHERE appointment_id = ?',
      [formatAppointmentDate(newDate), id]
    );
    return this.findById(id);
  }

  static async rejectReschedule(id) {
    await pool.query(
      'UPDATE appointments SET reschedule_requested = 0, preferred_date = NULL WHERE appointment_id = ?',
      [id]
    );
    return this.findById(id);
  }

  static async reassignExaminer(id, examinerId) {
    await pool.query('UPDATE appointments SET examiner_id = ? WHERE appointment_id = ?', [examinerId || null, id]);
    return this.findById(id);
  }

  static async markExpiredOverdue() {
    // Auto-expire appointments whose date passed while still Pending/Approved
    const [result] = await pool.query(
      "UPDATE appointments SET status = 'Expired' WHERE appointment_date < DATE_SUB(NOW(), INTERVAL 1 DAY) AND status IN ('Pending','Approved')"
    );
    return result.affectedRows;
  }

  static async markLate(id) {
    await pool.query(
      'UPDATE appointments SET late_at = NOW() WHERE appointment_id = ? AND late_at IS NULL',
      [id]
    );
    return this.findById(id);
  }

  static async autoMarkNoShow() {
    // Mark as No Show if appointment started > 30 minutes ago and still Pending/Approved
    const [result] = await pool.query(
      "UPDATE appointments SET status = 'No Show' WHERE status IN ('Pending','Approved') AND appointment_date <= DATE_SUB(NOW(), INTERVAL 30 MINUTE)"
    );
    return result.affectedRows;
  }

  static async count(filters = {}) {
    const drvSoft = await ensureDriverSoftDelete();
    let query = 'SELECT COUNT(*) as total FROM appointments a LEFT JOIN drivers d ON a.driver_id = d.driver_id';
    const params = [];
    const conditions = [];

    if (drvSoft) conditions.push('d.deleted_at IS NULL');

    if (filters.status) {
      conditions.push('a.status = ?');
      params.push(normalizeStatus(filters.status));
    }

    if (filters.type) {
      conditions.push('a.appointment_type = ?');
      params.push(normalizeAppointmentType(filters.type));
    }

    if (filters.search) {
      conditions.push('(d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (filters.date_from) {
      conditions.push('a.appointment_date >= ?');
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push('a.appointment_date <= ?');
      params.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  static async getUpcoming(days = 7) {
    const drvSoft = await ensureDriverSoftDelete();
    const dFilter = drvSoft ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT a.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM appointments a LEFT JOIN drivers d ON a.driver_id = d.driver_id WHERE a.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY) AND a.status IN ("Pending", "Approved") ${dFilter} ORDER BY a.appointment_date ASC`,
      [days]
    );
    return rows.map(mapAppointmentRow);
  }

  static async getOverdue() {
    const drvSoft = await ensureDriverSoftDelete();
    const dFilter = drvSoft ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT a.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM appointments a LEFT JOIN drivers d ON a.driver_id = d.driver_id WHERE a.appointment_date < NOW() AND a.status IN ("Pending", "Approved") ${dFilter} ORDER BY a.appointment_date ASC`
    );
    return rows.map(mapAppointmentRow);
  }

  static async getStatistics() {
    const drvSoft = await ensureDriverSoftDelete();
    const dWhere = drvSoft ? 'WHERE d.deleted_at IS NULL' : '';
    const base = 'FROM appointments a LEFT JOIN drivers d ON a.driver_id = d.driver_id';
    const countBy = async (whereClause, params = []) => {
      const [rows] = await pool.query(`SELECT COUNT(*) as count ${base} ${whereClause}`, params);
      return rows[0].count;
    };
    const soft = drvSoft ? 'd.deleted_at IS NULL' : '1=1';

    const total = await countBy(dWhere);
    const pending = await countBy(`WHERE ${soft} AND a.status = "Pending"`);
    const approved = await countBy(`WHERE ${soft} AND a.status = "Approved"`);
    const checkedIn = await countBy(`WHERE ${soft} AND a.status = "Checked In"`);
    const waiting = await countBy(`WHERE ${soft} AND a.status = "Waiting"`);
    const inProgress = await countBy(`WHERE ${soft} AND a.status = "In Progress"`);
    const completed = await countBy(`WHERE ${soft} AND a.status = "Completed"`);
    const cancelled = await countBy(`WHERE ${soft} AND a.status = "Cancelled"`);
    const rescheduled = await countBy(`WHERE ${soft} AND a.status = "Rescheduled"`);
    const noShow = await countBy(`WHERE ${soft} AND a.status = "No Show"`);
    const expired = await countBy(`WHERE ${soft} AND a.status = "Expired"`);
    const rescheduleRequests = await countBy(`WHERE ${soft} AND a.reschedule_requested = 1`);

    return {
      total,
      scheduled: pending + approved,
      completed,
      cancelled,
      pending,
      approved,
      checkedIn,
      waiting,
      inProgress,
      rescheduled,
      noShow,
      expired,
      rescheduleRequests
    };
  }
}

module.exports = Appointment;
