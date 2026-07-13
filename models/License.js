const pool = require('../config/database');

class License {
  static async findAll(filters = {}) {
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    let query = 'SELECT l.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM licenses l LEFT JOIN drivers d ON l.driver_id = d.driver_id';
    const params = [];
    const conditions = [];

    if (licCol) conditions.push('l.deleted_at IS NULL');
    if (drvCol) conditions.push('d.deleted_at IS NULL');

    if (filters.search) {
      conditions.push('(l.license_number LIKE ? OR d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ? OR d.phone LIKE ? OR d.email LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.status) {
      conditions.push('l.license_status = ?');
      params.push(filters.status);
    }

    if (filters.workflow) {
      conditions.push('l.workflow_status = ?');
      params.push(filters.workflow);
    }

    if (filters.category) {
      conditions.push('l.category_id = ?');
      params.push(filters.category);
    }

    if (filters.category_id) {
      conditions.push('l.category_id = ?');
      params.push(filters.category_id);
    }

    if (filters.date_from) {
      conditions.push('l.issue_date >= ?');
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push('l.issue_date <= ?');
      params.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY l.license_id DESC';

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
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const lFilter = licCol ? 'AND l.deleted_at IS NULL' : '';
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT l.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM licenses l LEFT JOIN drivers d ON l.driver_id = d.driver_id WHERE l.license_id = ? ${lFilter} ${dFilter}`,
      [id]
    );
    return rows[0];
  }

  static async findByLicenseNumber(licenseNumber) {
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const lFilter = licCol ? 'AND l.deleted_at IS NULL' : '';
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT l.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM licenses l LEFT JOIN drivers d ON l.driver_id = d.driver_id WHERE l.license_number = ? ${lFilter} ${dFilter}`,
      [licenseNumber]
    );
    return rows[0];
  }

  static async findByNationalId(nationalId) {
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const lFilter = licCol ? 'AND l.deleted_at IS NULL' : '';
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT l.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city, d.address, d.date_of_birth, d.photo, d.status AS driver_status FROM licenses l LEFT JOIN drivers d ON l.driver_id = d.driver_id WHERE d.national_id = ? ${lFilter} ${dFilter} ORDER BY l.license_id DESC`,
      [nationalId]
    );
    return rows;
  }

  static async create(licenseData) {
    const [result] = await pool.query('INSERT INTO licenses SET ?', licenseData);
    return this.findById(result.insertId);
  }

  static async update(id, licenseData) {
    await pool.query('UPDATE licenses SET ? WHERE license_id = ?', [licenseData, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    if (licCol) {
      await pool.query('UPDATE licenses SET deleted_at = NOW() WHERE license_id = ?', [id]);
    } else {
      await pool.query('DELETE FROM licenses WHERE license_id = ?', [id]);
    }
  }

  static async renew(id, renewalData) {
    await pool.query('UPDATE licenses SET ? WHERE license_id = ?', [renewalData, id]);
    return this.findById(id);
  }

  static async suspend(id, reason) {
    await pool.query('UPDATE licenses SET license_status = "Suspended" WHERE license_id = ?', [id]);
    return this.findById(id);
  }

  static async revoke(id, reason) {
    await pool.query('UPDATE licenses SET license_status = "Revoked" WHERE license_id = ?', [id]);
    return this.findById(id);
  }

  // --- Workflow status transitions ---
  static async verifyPayment(id, userId) {
    await pool.query(
      'UPDATE licenses SET workflow_status = "Approved", payment_verified_at = NOW() WHERE license_id = ?',
      [id]
    );
    return this.findById(id);
  }

  static async approveLicense(id, userId) {
    await pool.query(
      'UPDATE licenses SET workflow_status = "Approved", approved_at = NOW() WHERE license_id = ?',
      [id]
    );
    return this.findById(id);
  }

  static async printLicense(id, userId) {
    await pool.query(
      'UPDATE licenses SET workflow_status = "Printed", printed_at = NOW(), printed_by = ? WHERE license_id = ?',
      [userId || null, id]
    );
    return this.findById(id);
  }

  static async markReadyForCollection(id, userId) {
    await pool.query(
      'UPDATE licenses SET workflow_status = "Ready for Collection" WHERE license_id = ?',
      [id]
    );
    return this.findById(id);
  }

  static async collectLicense(id, userId) {
    await pool.query(
      'UPDATE licenses SET workflow_status = "Collected", license_status = "Active", collected_at = NOW(), collected_by = ? WHERE license_id = ?',
      [userId || null, id]
    );
    return this.findById(id);
  }

  static async count(filters = {}) {
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    let query = 'SELECT COUNT(*) as total FROM licenses l LEFT JOIN drivers d ON l.driver_id = d.driver_id';
    const params = [];
    const conditions = [];

    if (licCol) conditions.push('l.deleted_at IS NULL');
    if (drvCol) conditions.push('d.deleted_at IS NULL');

    if (filters.search) {
      conditions.push('(l.license_number LIKE ? OR d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ? OR d.phone LIKE ? OR d.email LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.status) {
      conditions.push('l.license_status = ?');
      params.push(filters.status);
    }

    if (filters.workflow) {
      conditions.push('l.workflow_status = ?');
      params.push(filters.workflow);
    }

    if (filters.category || filters.category_id) {
      conditions.push('l.category_id = ?');
      params.push(filters.category || filters.category_id);
    }

    if (filters.date_from) {
      conditions.push('l.issue_date >= ?');
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push('l.issue_date <= ?');
      params.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  static async getStatistics() {
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    const base = licCol ? 'WHERE deleted_at IS NULL' : '';
    const mid = licCol ? ' AND deleted_at IS NULL' : '';
    const countBy = async (whereClause) => {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM licenses ${whereClause}`);
      return rows[0].count;
    };
    const countByStatus = async (status) => {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM licenses WHERE license_status = ?${mid}`, [status]);
      return rows[0].count;
    };
    const countByWorkflow = async (status) => {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM licenses WHERE workflow_status = ?${mid}`, [status]);
      return rows[0].count;
    };

    return {
      total: await countBy(base),
      active: await countByStatus('Active'),
      expired: await countByStatus('Expired'),
      suspended: await countByStatus('Suspended'),
      revoked: await countByStatus('Revoked'),
      pending: await countByStatus('Pending'),
      pendingPayment: await countByWorkflow('Pending Payment'),
      approved: await countByWorkflow('Approved'),
      printed: await countByWorkflow('Printed'),
      readyForCollection: await countByWorkflow('Ready for Collection'),
      collected: await countByWorkflow('Collected')
    };
  }

  static async getExpiringSoon(days = 30) {
    const [[licCol]] = await pool.query("SHOW COLUMNS FROM licenses LIKE 'deleted_at'");
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const lFilter = licCol ? 'AND l.deleted_at IS NULL' : '';
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT l.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM licenses l LEFT JOIN drivers d ON l.driver_id = d.driver_id WHERE l.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY) AND l.license_status = "Active" ${lFilter} ${dFilter}`,
      [days]
    );
    return rows;
  }
}

module.exports = License;
