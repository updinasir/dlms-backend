const pool = require('../config/database');

// Get all portal data for the currently authenticated driver
const getMyPortalData = async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ message: 'User email not found in token' });
    }

    // Find driver by email (case-insensitive, whitespace tolerant)
    const [driverRows] = await pool.query(
      'SELECT * FROM drivers WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1',
      [email]
    );
    if (!driverRows.length) {
      return res.status(404).json({ message: 'Driver record not found for this account' });
    }
    const driver = driverRows[0];
    const driverId = driver.driver_id;

    // Each related dataset is loaded independently so a failure in one
    // (e.g. a schema difference) cannot blank out the entire profile.
    const safeQuery = async (sql, params) => {
      try {
        const [rows] = await pool.query(sql, params);
        return rows;
      } catch (err) {
        console.error('Portal sub-query failed:', err.message);
        return [];
      }
    };

    // License
    const licenseRows = await safeQuery(
      `SELECT l.*, lc.category_name, lc.description
       FROM licenses l
       LEFT JOIN license_categories lc ON l.category_id = lc.category_id
       WHERE l.driver_id = ? AND l.deleted_at IS NULL
       ORDER BY l.issue_date DESC
       LIMIT 1`,
      [driverId]
    );
    const license = licenseRows[0] || null;

    // Exams
    const examRows = await safeQuery(
      `SELECT
        CONCAT('P-', pe.practical_exam_id) AS exam_uid,
        'practical' AS exam_type,
        pe.exam_date,
        pe.score,
        pe.result,
        pe.remarks,
        CASE WHEN pe.result IS NULL THEN 'scheduled' ELSE 'completed' END AS status
      FROM practical_exams pe WHERE pe.driver_id = ?
      UNION ALL
      SELECT
        CONCAT('T-', te.theory_exam_id) AS exam_uid,
        'theory' AS exam_type,
        te.exam_date,
        te.score,
        te.result,
        te.remarks,
        CASE WHEN te.result IS NULL THEN 'scheduled' ELSE 'completed' END AS status
      FROM theory_exams te WHERE te.driver_id = ?
      ORDER BY exam_date DESC`,
      [driverId, driverId]
    );

    // Payments
    const paymentRows = await safeQuery(
      `SELECT payment_id, payment_type, amount, payment_method, transaction_reference, payment_date, payment_status
       FROM payments WHERE driver_id = ? ORDER BY payment_date DESC`,
      [driverId]
    );

    // Appointments
    const appointmentRows = await safeQuery(
      `SELECT appointment_id, appointment_type, appointment_date, status, notes
       FROM appointments WHERE driver_id = ? ORDER BY appointment_date DESC`,
      [driverId]
    );

    // Documents
    const documentRows = await safeQuery(
      `SELECT document_id, document_type, file_path, uploaded_at
       FROM documents WHERE driver_id = ? ORDER BY uploaded_at DESC`,
      [driverId]
    );

    res.json({
      driver,
      license,
      exams: examRows,
      payments: paymentRows,
      appointments: appointmentRows,
      documents: documentRows
    });
  } catch (error) {
    console.error('Get driver portal data error:', error);
    res.status(500).json({ message: 'Server error loading portal data' });
  }
};

// Get notifications for the currently authenticated driver
const getMyNotifications = async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ message: 'User email not found in token' });
    }

    const [driverRows] = await pool.query(
      'SELECT driver_id FROM drivers WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1',
      [email]
    );
    if (!driverRows.length) {
      return res.json({ notifications: [], unreadCount: 0 });
    }

    const driverId = driverRows[0].driver_id;

    const [notifications] = await pool.query(
      `SELECT notification_id AS id, title, message, notification_type AS type, IF(is_read = 1, 'read', 'unread') AS status, created_at
       FROM notifications WHERE driver_id = ? ORDER BY created_at DESC`,
      [driverId]
    );

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE driver_id = ? AND is_read = 0',
      [driverId]
    );

    res.json({ notifications, unreadCount: countRows[0].count });
  } catch (error) {
    console.error('Get my notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark a notification as read for the current driver
const markMyNotificationRead = async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ message: 'User email not found in token' });
    }

    const [driverRows] = await pool.query(
      'SELECT driver_id FROM drivers WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1',
      [email]
    );
    if (!driverRows.length) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const driverId = driverRows[0].driver_id;
    const notificationId = req.params.id;

    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND driver_id = ?',
      [notificationId, driverId]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getMyPortalData, getMyNotifications, markMyNotificationRead };
