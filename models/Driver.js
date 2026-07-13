const pool = require('../config/database');

// Soft-delete support detection for drivers and licenses
let DRV_SOFT_DELETE = { checked: false, supported: false };
let LIC_SOFT_DELETE = { checked: false, supported: false };
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
const ensureLicenseSoftDelete = async () => {
  if (LIC_SOFT_DELETE.checked) return LIC_SOFT_DELETE.supported;
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    LIC_SOFT_DELETE = { checked: true, supported: cols.length > 0 };
  } catch {
    LIC_SOFT_DELETE = { checked: true, supported: false };
  }
  return LIC_SOFT_DELETE.supported;
};

const mapDriverRow = (row) => {
  if (!row) return null;
  const { fingerprint_data, ...safe } = row;
  return safe;
};

class Driver {
  static async findAll(filters = {}) {
    const drvSoft = await ensureDriverSoftDelete();
    let query = `SELECT * FROM drivers WHERE ${drvSoft ? 'deleted_at IS NULL' : '1=1'}`;
    const params = [];

    if (filters.search) {
      if (filters.exact) {
        query += ' AND national_id = ?';
        params.push(filters.search);
      } else {
        query += ' AND (national_id LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.date_from) {
      query += ' AND registration_date >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND registration_date <= ?';
      params.push(filters.date_to);
    }

    query += ' ORDER BY registration_date DESC';

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
    return rows.map(mapDriverRow);
  }

  static async findById(id) {
    const drvSoft = await ensureDriverSoftDelete();
    const where = drvSoft ? 'driver_id = ? AND deleted_at IS NULL' : 'driver_id = ?';
    const [rows] = await pool.query(`SELECT * FROM drivers WHERE ${where}`, [id]);
    return mapDriverRow(rows[0]);
  }

  static async findByLicenseNumber(licenseNumber) {
    const drvSoft = await ensureDriverSoftDelete();
    const licSoft = await ensureLicenseSoftDelete();
    const dFilter = drvSoft ? 'AND d.deleted_at IS NULL' : '';
    const lFilter = licSoft ? 'AND l.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT d.*, l.license_number, l.license_id, l.issue_date, l.expiry_date, l.license_status FROM drivers d LEFT JOIN licenses l ON d.driver_id = l.driver_id WHERE l.license_number = ? ${lFilter} ${dFilter}`,
      [licenseNumber]
    );
    return mapDriverRow(rows[0]);
  }

  static async create(driverData) {
    const [result] = await pool.query('INSERT INTO drivers SET ?', driverData);
    return this.findById(result.insertId);
  }

  static async update(id, driverData) {
    await pool.query('UPDATE drivers SET ? WHERE driver_id = ?', [driverData, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const drvSoft = await ensureDriverSoftDelete();
    if (drvSoft) {
      await pool.query('UPDATE drivers SET deleted_at = NOW() WHERE driver_id = ?', [id]);
    } else {
      await pool.query('DELETE FROM drivers WHERE driver_id = ?', [id]);
    }
  }

  static async count(filters = {}) {
    const drvSoft = await ensureDriverSoftDelete();
    let query = `SELECT COUNT(*) as total FROM drivers WHERE ${drvSoft ? 'deleted_at IS NULL' : '1=1'}`;
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      query += ' AND (national_id LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.date_from) {
      query += ' AND registration_date >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND registration_date <= ?';
      params.push(filters.date_to);
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  static async getStatistics() {
    const drvSoft = await ensureDriverSoftDelete();
    const base = drvSoft ? 'WHERE deleted_at IS NULL' : '';
    const mid = drvSoft ? ' AND deleted_at IS NULL' : '';
    const [total] = await pool.query(`SELECT COUNT(*) as count FROM drivers ${base}`);
    const [approved] = await pool.query(`SELECT COUNT(*) as count FROM drivers WHERE status = "Approved"${mid}`);
    const [rejected] = await pool.query(`SELECT COUNT(*) as count FROM drivers WHERE status = "Rejected"${mid}`);
    const [pending] = await pool.query(`SELECT COUNT(*) as count FROM drivers WHERE status = "Pending"${mid}`);

    return {
      total: total[0].count,
      approved: approved[0].count,
      rejected: rejected[0].count,
      pending: pending[0].count
    };
  }
}

module.exports = Driver;
