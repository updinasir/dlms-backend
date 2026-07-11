const pool = require('../config/database');

const SELECT_COLUMNS = `
  n.notification_id AS id,
  n.user_id,
  n.driver_id,
  n.title,
  n.message,
  n.notification_type,
  n.category,
  n.priority,
  n.delivery_channel,
  IF(n.is_read = 1, 'read', 'unread') AS read_state,
  n.status,
  n.triggered_by,
  n.related_module,
  n.related_record_id,
  n.related_link,
  n.event_key,
  n.is_read,
  n.read_at,
  n.archived,
  n.created_at,
  n.sent_at
`;

/*
 * Build a WHERE clause scoped to a recipient plus optional filters.
 * scope: { userId, driverId } - a notification matches if it targets either.
 */
const buildFilters = (filters = {}) => {
  const clauses = [];
  const params = [];

  // Recipient scoping (staff user or driver)
  const recipientClauses = [];
  if (filters.userId) {
    recipientClauses.push('n.user_id = ?');
    params.push(filters.userId);
  }
  if (filters.driverId) {
    recipientClauses.push('n.driver_id = ?');
    params.push(filters.driverId);
  }
  if (recipientClauses.length) {
    clauses.push(`(${recipientClauses.join(' OR ')})`);
  }

  if (filters.category) {
    clauses.push('n.category = ?');
    params.push(filters.category);
  }
  if (filters.priority) {
    clauses.push('n.priority = ?');
    params.push(filters.priority);
  }
  if (filters.status) {
    clauses.push('n.status = ?');
    params.push(filters.status);
  }
  if (filters.module) {
    clauses.push('n.related_module = ?');
    params.push(filters.module);
  }
  if (filters.readState === 'read') {
    clauses.push('n.is_read = 1');
  } else if (filters.readState === 'unread') {
    clauses.push('n.is_read = 0');
  }
  if (filters.search) {
    clauses.push('(n.title LIKE ? OR n.message LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.date_from) {
    clauses.push('n.created_at >= ?');
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push('n.created_at <= ?');
    params.push(`${filters.date_to} 23:59:59`);
  }
  if (filters.archived === true) {
    clauses.push('n.archived = 1');
  } else if (filters.includeArchived !== true) {
    clauses.push('n.archived = 0');
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
};

class Notification {
  static async findAll(filters = {}) {
    const { where, params } = buildFilters(filters);
    let query = `SELECT ${SELECT_COLUMNS} FROM notifications n ${where} ORDER BY n.created_at DESC`;

    if (filters.limit) {
      const limit = Math.min(parseInt(filters.limit), 100);
      query += ' LIMIT ?';
      params.push(limit);
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset));
      }
    }

    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async count(filters = {}) {
    const { where, params } = buildFilters(filters);
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM notifications n ${where}`, params);
    return rows[0].total;
  }

  static async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${SELECT_COLUMNS},
              tu.full_name AS triggered_by_name,
              u.full_name AS recipient_user_name,
              CONCAT(d.first_name, ' ', d.last_name) AS recipient_driver_name
       FROM notifications n
       LEFT JOIN users tu ON n.triggered_by = tu.user_id
       LEFT JOIN users u ON n.user_id = u.user_id
       LEFT JOIN drivers d ON n.driver_id = d.driver_id
       WHERE n.notification_id = ?`,
      [id]
    );
    return rows[0];
  }

  static async create(notificationData) {
    const [result] = await pool.query('INSERT INTO notifications SET ?', notificationData);
    return this.findById(result.insertId);
  }

  static async update(id, notificationData) {
    await pool.query('UPDATE notifications SET ? WHERE notification_id = ?', [notificationData, id]);
    return this.findById(id);
  }

  static async delete(id) {
    await pool.query('DELETE FROM notifications WHERE notification_id = ?', [id]);
  }

  static async markAsRead(id) {
    await pool.query(
      "UPDATE notifications SET is_read = 1, status = 'Read', read_at = NOW() WHERE notification_id = ?",
      [id]
    );
    return this.findById(id);
  }

  static async markAsUnread(id) {
    await pool.query(
      "UPDATE notifications SET is_read = 0, status = 'Sent', read_at = NULL WHERE notification_id = ?",
      [id]
    );
    return this.findById(id);
  }

  static async markAllAsRead(scope = {}) {
    const conds = [];
    const params = [];
    if (scope.userId) { conds.push('user_id = ?'); params.push(scope.userId); }
    if (scope.driverId) { conds.push('driver_id = ?'); params.push(scope.driverId); }
    if (!conds.length) return;
    await pool.query(
      `UPDATE notifications SET is_read = 1, status = 'Read', read_at = NOW()
       WHERE is_read = 0 AND (${conds.join(' OR ')})`,
      params
    );
  }

  static async archive(id) {
    await pool.query('UPDATE notifications SET archived = 1 WHERE notification_id = ?', [id]);
  }

  static async archiveOlderThan(days, scope = {}) {
    const conds = ['created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', 'archived = 0'];
    const params = [parseInt(days)];
    if (scope.userId) { conds.push('user_id = ?'); params.push(scope.userId); }
    const [result] = await pool.query(
      `UPDATE notifications SET archived = 1 WHERE ${conds.join(' AND ')}`,
      params
    );
    return result.affectedRows;
  }

  static async getUnreadCount(scope = {}) {
    const conds = ['is_read = 0', 'archived = 0'];
    const params = [];
    const recip = [];
    if (scope.userId) { recip.push('user_id = ?'); params.push(scope.userId); }
    if (scope.driverId) { recip.push('driver_id = ?'); params.push(scope.driverId); }
    if (recip.length) conds.push(`(${recip.join(' OR ')})`);
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE ${conds.join(' AND ')}`,
      params
    );
    return rows[0].count;
  }
}

module.exports = Notification;
