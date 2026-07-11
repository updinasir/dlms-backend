const pool = require('../config/database');
const Service = require('./Service');

class Payment {
  static async findAll(filters = {}) {
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'd.deleted_at IS NULL' : '';
    let query = 'SELECT p.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id';
    const params = [];
    const conditions = ['p.deleted_at IS NULL'];

    if (dFilter) conditions.push(dFilter);

    if (filters.status) {
      conditions.push('p.payment_status = ?');
      params.push(filters.status);
    }

    if (filters.type) {
      conditions.push('p.payment_type = ?');
      params.push(filters.type);
    }

    if (filters.search) {
      conditions.push('(p.transaction_reference LIKE ? OR d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ? OR d.phone LIKE ? OR d.email LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.date_from) {
      conditions.push('p.payment_date >= ?');
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push('p.payment_date <= ?');
      params.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.payment_date DESC';

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
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT p.*, d.national_id, d.first_name, d.last_name, d.phone, d.email, d.city FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id WHERE p.payment_id = ? AND p.deleted_at IS NULL ${dFilter}`,
      [id]
    );
    return rows[0];
  }

  static async findByTransactionReference(transactionReference) {
    const [rows] = await pool.query('SELECT * FROM payments WHERE transaction_reference = ?', [transactionReference]);
    return rows[0];
  }

  static async generateReceiptNumber() {
    const year = new Date().getFullYear();
    const prefix = `RCP-${year}-`;
    
    // Get the last receipt number for this year
    const [rows] = await pool.query(
      'SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY payment_id DESC LIMIT 1',
      [`${prefix}%`]
    );
    
    let nextNumber = 1;
    if (rows.length > 0) {
      const lastReceipt = rows[0].receipt_number;
      const lastNumber = parseInt(lastReceipt.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    // Format as 6-digit number with leading zeros
    return `${prefix}${String(nextNumber).padStart(6, '0')}`;
  }

  static async create(paymentData) {
    // Validate service and price if service_id is provided
    if (paymentData.service_id) {
      const service = await Service.findById(paymentData.service_id);
      if (!service) {
        throw new Error('Service not found');
      }
      if (service.status !== 'Active') {
        throw new Error('Service is not active');
      }
      
      // Ensure payment amount matches official price
      const paymentAmount = parseFloat(paymentData.amount);
      const officialPrice = parseFloat(service.official_price);
      
      if (paymentAmount !== officialPrice) {
        throw new Error(`Payment amount must equal official service price of $${officialPrice}`);
      }
      
      // Add official price snapshot and receipt number
      paymentData.official_price_at_payment = officialPrice;
      if (!paymentData.receipt_number) {
        paymentData.receipt_number = await this.generateReceiptNumber();
      }
    }
    
    const [result] = await pool.query('INSERT INTO payments SET ?', paymentData);
    return this.findById(result.insertId);
  }

  static async update(id, paymentData) {
    await pool.query('UPDATE payments SET ? WHERE payment_id = ?', [paymentData, id]);
    return this.findById(id);
  }

  static async delete(id) {
    // Payments must never be permanently deleted - soft delete only
    await pool.query('UPDATE payments SET deleted_at = NOW() WHERE payment_id = ?', [id]);
  }

  static async count(filters = {}) {
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'd.deleted_at IS NULL' : '';
    let query = 'SELECT COUNT(*) as total FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id';
    const params = [];
    const conditions = ['p.deleted_at IS NULL'];

    if (dFilter) conditions.push(dFilter);

    if (filters.status) {
      conditions.push('p.payment_status = ?');
      params.push(filters.status);
    }

    if (filters.type) {
      conditions.push('p.payment_type = ?');
      params.push(filters.type);
    }

    if (filters.search) {
      conditions.push('(p.transaction_reference LIKE ? OR d.national_id LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ? OR d.phone LIKE ? OR d.email LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.date_from) {
      conditions.push('p.payment_date >= ?');
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push('p.payment_date <= ?');
      params.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  static async getTotalRevenue(filters = {}) {
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    let query = `SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id WHERE p.payment_status = "Completed" ${dFilter}`;
    const params = [];

    if (filters.date_from) {
      query += ' AND payment_date >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND payment_date <= ?';
      params.push(filters.date_to);
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  static async getRevenueByDateRange(startDate, endDate) {
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const [rows] = await pool.query(
      `SELECT DATE(p.payment_date) as date, SUM(p.amount) as revenue FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id WHERE p.payment_status = "Completed" AND p.payment_date BETWEEN ? AND ? ${dFilter} GROUP BY DATE(p.payment_date) ORDER BY date`,
      [startDate, endDate]
    );
    return rows;
  }

  static async getStatistics() {
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const dFilter = drvCol ? 'AND d.deleted_at IS NULL' : '';
    const [total] = await pool.query(`SELECT COUNT(*) as count FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id ${dFilter ? dFilter.replace('AND','WHERE') : ''}`);
    const [completed] = await pool.query(`SELECT COUNT(*) as count FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id WHERE p.payment_status = "Completed" ${dFilter}`);
    const [pending] = await pool.query(`SELECT COUNT(*) as count FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id WHERE p.payment_status = "Pending" ${dFilter}`);
    const [revenue] = await pool.query(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id WHERE p.payment_status = "Completed" ${dFilter}`);

    const today = new Date().toISOString().split('T')[0];
    const [todayRevenue] = await pool.query(
      `SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p LEFT JOIN drivers d ON p.driver_id = d.driver_id WHERE p.payment_status = "Completed" AND DATE(p.payment_date) = ? ${dFilter}`,
      [today]
    );

    return {
      total: total[0].count,
      completed: completed[0].count,
      pending: pending[0].count,
      revenue: revenue[0].total,
      today_revenue: todayRevenue[0].total,
      total_transactions: total[0].count
    };
  }
}

module.exports = Payment;
