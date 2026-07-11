const pool = require('../config/database');

// Get all audit logs with pagination and filters
const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, user_id, table_name, tables, action_performed, actions, module, status, search, from_date, to_date } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT al.*, u.full_name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.user_id WHERE 1=1';
    const params = [];

    if (user_id) {
      query += ' AND al.user_id = ?';
      params.push(user_id);
    }

    if (table_name) {
      query += ' AND al.table_name = ?';
      params.push(table_name);
    }

    // Support comma-separated list of tables for category pages
    if (tables) {
      const list = String(tables).split(',').map((t) => t.trim()).filter(Boolean);
      if (list.length) {
        query += ` AND al.table_name IN (${list.map(() => '?').join(',')})`;
        params.push(...list);
      }
    }

    if (action_performed) {
      query += ' AND al.action_performed = ?';
      params.push(action_performed);
    }

    // Support comma-separated list of actions for category pages
    if (actions) {
      const list = String(actions).split(',').map((a) => a.trim()).filter(Boolean);
      if (list.length) {
        query += ` AND al.action_performed IN (${list.map(() => '?').join(',')})`;
        params.push(...list);
      }
    }

    if (module) {
      query += ' AND al.module = ?';
      params.push(module);
    }

    if (status) {
      query += ' AND al.status = ?';
      params.push(status);
    }

    if (from_date) {
      query += ' AND DATE(al.action_time) >= ?';
      params.push(from_date);
    }

    if (to_date) {
      query += ' AND DATE(al.action_time) <= ?';
      params.push(to_date);
    }

    if (search) {
      query += ' AND (u.full_name LIKE ? OR al.action_performed LIKE ? OR al.table_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countQuery = query.replace('al.*, u.full_name as user_name, u.email as user_email', 'COUNT(*) as total');
    const [countRows] = await pool.query(countQuery, [...params]);
    const total = countRows[0].total;

    // Get paginated results
    query += ' ORDER BY al.action_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, params);

    res.json({
      logs: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get audit log statistics
const getAuditLogStats = async (req, res) => {
  try {
    const [actionStats] = await pool.query(
      `SELECT action_performed, COUNT(*) as count FROM audit_logs GROUP BY action_performed ORDER BY count DESC`
    );

    const [tableStats] = await pool.query(
      `SELECT table_name, COUNT(*) as count FROM audit_logs GROUP BY table_name ORDER BY count DESC`
    );

    const [todayCount] = await pool.query(
      `SELECT COUNT(*) as count FROM audit_logs WHERE DATE(action_time) = CURDATE()`
    );

    res.json({
      actionStats,
      tableStats,
      todayCount: todayCount[0].count
    });
  } catch (error) {
    console.error('Get audit log stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a single audit log by ID with user details
const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT al.*, u.full_name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.user_id WHERE al.log_id = ?',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Audit log not found' });
    }

    const log = rows[0];
    const userId = log.user_id;
    const sessionId = log.session_id;
    const recordId = log.record_id;
    const tableName = log.table_name;

    // Fetch user details
    let userDetails = null;
    if (userId) {
      const [userRows] = await pool.query(
        'SELECT user_id, employee_id, username, full_name, email, phone, role_id, department, branch_office, profile_picture, status, last_login FROM users WHERE user_id = ?',
        [userId]
      );
      userDetails = userRows[0] || null;
    }

    // Fetch session info
    let sessionInfo = null;
    if (sessionId) {
      const [sessionRows] = await pool.query(
        'SELECT session_id, login_time, logout_time, session_duration as duration, ip_address, public_ip, local_ip, user_agent, browser, os, device_type, screen_resolution, country, region, city, isp, vpn_detected, proxy_detected, is_active FROM login_history WHERE session_id = ? ORDER BY login_time DESC LIMIT 1',
        [sessionId]
      );
      sessionInfo = sessionRows[0] || null;
    }
    if (!sessionInfo && sessionId) {
      const [sessionRows2] = await pool.query(
        'SELECT session_id, login_time, logout_time, duration, ip_address, public_ip, local_ip, user_agent, browser, os, device_type, screen_resolution, country, region, city, isp, vpn_detected, proxy_detected, is_active FROM user_sessions WHERE session_id = ? ORDER BY login_time DESC LIMIT 1',
        [sessionId]
      );
      sessionInfo = sessionRows2[0] || null;
    }

    // Fetch affected record details
    let affectedRecord = null;
    let relatedRecords = {};
    if (recordId && tableName) {
      affectedRecord = await fetchAffectedRecord(tableName, recordId);
      if (affectedRecord) {
        relatedRecords = await fetchRelatedRecords(tableName, affectedRecord);
      }
    }

    res.json({
      log,
      user: userDetails,
      session: sessionInfo,
      affectedRecord,
      relatedRecords
    });
  } catch (error) {
    console.error('Get audit log by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Fetch affected record details from the appropriate table
async function fetchAffectedRecord(tableName, recordId) {
  try {
    const table = tableName.toLowerCase();
    let query = null;
    let params = [recordId];

    if (table === 'drivers') {
      query = 'SELECT driver_id as id, first_name, last_name, full_name, national_id, license_number, phone, address, city, status, created_at, updated_at FROM drivers WHERE driver_id = ?';
    } else if (table === 'licenses') {
      query = 'SELECT license_id as id, license_number, driver_id, issue_date, expiry_date, license_class, status, created_at FROM licenses WHERE license_id = ?';
    } else if (table === 'vehicles') {
      query = 'SELECT vehicle_id as id, plate_number, vehicle_type, make, model, driver_id, status, created_at FROM vehicles WHERE vehicle_id = ?';
    } else if (table === 'payments') {
      query = 'SELECT payment_id as id, amount, payment_method, driver_id, license_id, status, created_at FROM payments WHERE payment_id = ?';
    } else if (table === 'users') {
      query = 'SELECT user_id as id, employee_id, username, full_name, email, phone, role_id, department, branch_office, status, created_at FROM users WHERE user_id = ?';
    } else if (table === 'exams') {
      query = 'SELECT exam_id as id, exam_type, result, score, driver_id, status, created_at FROM exams WHERE exam_id = ?';
    } else if (table === 'appointments') {
      query = 'SELECT appointment_id as id, appointment_type, appointment_date, driver_id, status, created_at FROM appointments WHERE appointment_id = ?';
    }

    if (!query) return null;
    const [rows] = await pool.query(query, params);
    return rows[0] || null;
  } catch (error) {
    console.error('fetchAffectedRecord error:', error.message);
    return null;
  }
}

// Fetch related records based on the affected record
async function fetchRelatedRecords(tableName, record) {
  const result = {};
  try {
    if (tableName.toLowerCase() === 'drivers' && record.id) {
      const [licenses] = await pool.query('SELECT license_id as id, license_number, license_class, status, expiry_date FROM licenses WHERE driver_id = ?', [record.id]);
      const [vehicles] = await pool.query('SELECT vehicle_id as id, plate_number, make, model, status FROM vehicles WHERE driver_id = ?', [record.id]);
      const [payments] = await pool.query('SELECT payment_id as id, amount, payment_method, status, created_at FROM payments WHERE driver_id = ?', [record.id]);
      const [exams] = await pool.query('SELECT exam_id as id, exam_type, result, score, status, created_at FROM exams WHERE driver_id = ?', [record.id]);
      const [appointments] = await pool.query('SELECT appointment_id as id, appointment_type, appointment_date, status, created_at FROM appointments WHERE driver_id = ?', [record.id]);
      result.licenses = licenses;
      result.vehicles = vehicles;
      result.payments = payments;
      result.exams = exams;
      result.appointments = appointments;
    } else if (tableName.toLowerCase() === 'licenses' && record.driver_id) {
      const [driver] = await pool.query('SELECT driver_id as id, full_name, national_id, status FROM drivers WHERE driver_id = ?', [record.driver_id]);
      const [payments] = await pool.query('SELECT payment_id as id, amount, payment_method, status FROM payments WHERE license_id = ?', [record.id]);
      result.driver = driver[0] || null;
      result.payments = payments;
    }
  } catch (error) {
    console.error('fetchRelatedRecords error:', error.message);
  }
  return result;
}

// Get login history records (admin only)
const getLoginHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, user_id, status, search, from_date, to_date } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT lh.*, u.full_name as user_name, u.email as user_email FROM login_history lh LEFT JOIN users u ON lh.user_id = u.user_id WHERE 1=1';
    const params = [];

    if (user_id) { query += ' AND lh.user_id = ?'; params.push(user_id); }
    if (status) { query += ' AND lh.status = ?'; params.push(status); }
    if (from_date) { query += ' AND DATE(lh.login_time) >= ?'; params.push(from_date); }
    if (to_date) { query += ' AND DATE(lh.login_time) <= ?'; params.push(to_date); }
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR lh.ip_address LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const countQuery = query.replace('lh.*, u.full_name as user_name, u.email as user_email', 'COUNT(*) as total');
    const [countRows] = await pool.query(countQuery, [...params]);
    const total = countRows[0].total;

    query += ' ORDER BY lh.login_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const [rows] = await pool.query(query, params);

    res.json({
      logs: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogStats,
  getAuditLogById,
  getLoginHistory
};
