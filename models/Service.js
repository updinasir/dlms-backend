const pool = require('../config/database');

class Service {
  static async findAll(filters = {}) {
    let query = 'SELECT * FROM services';
    const params = [];
    const conditions = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.service_code) {
      conditions.push('service_code = ?');
      params.push(filters.service_code);
    }

    if (filters.search) {
      conditions.push('(service_name LIKE ? OR service_code LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY service_name ASC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(parseInt(filters.offset));
    }

    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM services WHERE service_id = ?', [id]);
    return rows[0];
  }

  static async findByCode(code) {
    const [rows] = await pool.query('SELECT * FROM services WHERE service_code = ?', [code]);
    return rows[0];
  }

  static async create(serviceData) {
    const [result] = await pool.query('INSERT INTO services SET ?', serviceData);
    return this.findById(result.insertId);
  }

  static async update(id, serviceData) {
    await pool.query('UPDATE services SET ? WHERE service_id = ?', [serviceData, id]);
    return this.findById(id);
  }

  static async delete(id) {
    // Soft delete by setting status to Inactive
    await pool.query('UPDATE services SET status = "Inactive" WHERE service_id = ?', [id]);
    return this.findById(id);
  }

  static async getActiveServices() {
    const [rows] = await pool.query('SELECT * FROM services WHERE status = "Active" ORDER BY service_name ASC');
    return rows;
  }

  static async getPriceHistory(serviceId) {
    const [rows] = await pool.query(
      `SELECT sph.*, u.username as changed_by_username 
       FROM service_price_history sph 
       LEFT JOIN users u ON sph.changed_by = u.user_id 
       WHERE sph.service_id = ? 
       ORDER BY sph.changed_at DESC`,
      [serviceId]
    );
    return rows;
  }

  static async recordPriceChange(historyData) {
    const [result] = await pool.query('INSERT INTO service_price_history SET ?', historyData);
    return result.insertId;
  }

  static async getStatistics() {
    const [total] = await pool.query('SELECT COUNT(*) as count FROM services');
    const [active] = await pool.query('SELECT COUNT(*) as count FROM services WHERE status = "Active"');
    const [inactive] = await pool.query('SELECT COUNT(*) as count FROM services WHERE status = "Inactive"');

    return {
      total: total[0].count,
      active: active[0].count,
      inactive: inactive[0].count
    };
  }
}

module.exports = Service;
