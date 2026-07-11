const Notification = require('../models/Notification');
const pool = require('../config/database');
const notificationService = require('../services/notificationService');
const { sendEmail } = require('../utils/emailService');

/*
 * Resolve the recipient scope for the current authenticated request.
 * Staff -> { userId }. Drivers (role 6) also carry { driverId } matched by email.
 */
const resolveScope = async (req) => {
  const scope = { userId: req.user?.id || null };
  if (Number(req.user?.role) === 6 && req.user?.email) {
    const [rows] = await pool.query('SELECT driver_id FROM drivers WHERE email = ? LIMIT 1', [req.user.email]);
    if (rows[0]) scope.driverId = rows[0].driver_id;
  }
  return scope;
};

const isAdmin = (req) => [1, 2].includes(Number(req.user?.role));
const isSuperAdmin = (req) => Number(req.user?.role) === 1;

// -------- Current user's notifications (in-app) --------

const getMyNotifications = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const {
      category, priority, status, module, readState, search,
      date_from, date_to, page = 1, limit = 10, archived
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {
      ...scope, category, priority, status, module, readState, search,
      date_from, date_to, limit, offset,
      archived: archived === 'true' ? true : undefined
    };

    const notifications = await Notification.findAll(filters);
    const total = await Notification.count(filters);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get my notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const count = await Notification.getUnreadCount(scope);
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    // Access control: owner or admin
    const scope = await resolveScope(req);
    const owns = notification.user_id === scope.userId ||
      (scope.driverId && notification.driver_id === scope.driverId);
    if (!owns && !isAdmin(req)) {
      return res.status(403).json({ message: 'Not authorized to view this notification' });
    }
    res.json({ notification });
  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.markAsRead(req.params.id);
    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const markAsUnread = async (req, res) => {
  try {
    const notification = await Notification.markAsUnread(req.params.id);
    res.json({ message: 'Notification marked as unread', notification });
  } catch (error) {
    console.error('Mark as unread error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    await Notification.markAllAsRead(scope);
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    await Notification.delete(req.params.id);
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const archiveNotification = async (req, res) => {
  try {
    await Notification.archive(req.params.id);
    res.json({ message: 'Notification archived' });
  } catch (error) {
    console.error('Archive notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// -------- Admin: all notifications + delivery history --------

const getAllNotifications = async (req, res) => {
  try {
    const {
      category, priority, status, module, search,
      date_from, date_to, page = 1, limit = 20
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {
      category, priority, status, module, search, date_from, date_to,
      limit, offset, includeArchived: true
    };
    const notifications = await Notification.findAll(filters);
    const total = await Notification.count(filters);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getEmailLogs = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (search) { clauses.push('(recipient_email LIKE ? OR subject LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT * FROM email_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM email_logs ${where}`, params);

    res.json({
      logs: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countRows[0].total,
        pages: Math.ceil(countRows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get email logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const retryEmail = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM email_logs WHERE email_log_id = ? LIMIT 1', [req.params.id]);
    const log = rows[0];
    if (!log) return res.status(404).json({ message: 'Email log not found' });
    if (log.status === 'Sent') return res.status(400).json({ message: 'Email already sent' });

    try {
      await sendEmail(log.recipient_email, log.subject, log.body);
      await pool.query(
        `UPDATE email_logs SET status = 'Sent', sent_at = NOW(), resent_at = NOW(), attempts = attempts + 1, error_message = NULL WHERE email_log_id = ?`,
        [log.email_log_id]
      );
      if (log.notification_id) {
        await pool.query("UPDATE notifications SET status = 'Sent' WHERE notification_id = ?", [log.notification_id]);
      }
      res.json({ message: 'Email resent successfully' });
    } catch (err) {
      await pool.query(
        `UPDATE email_logs SET status = 'Failed', attempts = attempts + 1, error_message = ? WHERE email_log_id = ?`,
        [String(err.message).slice(0, 500), log.email_log_id]
      );
      res.status(502).json({ message: 'Retry failed', error: err.message });
    }
  } catch (error) {
    console.error('Retry email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// -------- Admin announcements --------

const sendAnnouncement = async (req, res) => {
  try {
    const {
      title, message, category = 'Information', priority = 'Medium',
      delivery_channel = 'System', audience_type = 'all', roles = [], user_id, driver_id
    } = req.body;

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const userRole = Number(req.user?.role);
    const isSuperAdmin = userRole === 1;
    const isAdmin = userRole === 1 || userRole === 2;

    // Non-admin staff can only message drivers or specific users/drivers.
    if (!isAdmin) {
      const allowedAudiences = ['drivers', 'user', 'driver'];
      if (!allowedAudiences.includes(audience_type)) {
        return res.status(403).json({ message: 'You can only send messages to drivers or a specific user/driver' });
      }
    }

    // Admin (but not superadmin) cannot send to Everyone or Specific Roles.
    if (isAdmin && !isSuperAdmin) {
      const allowedAudiences = ['staff', 'drivers', 'user', 'driver'];
      if (!allowedAudiences.includes(audience_type)) {
        return res.status(403).json({ message: 'Admins can send to all staff, all drivers, or a specific user/driver' });
      }
    }

    const target = {};
    if (audience_type === 'all') { target.allUsers = true; target.allDrivers = true; }
    else if (audience_type === 'staff') { target.allUsers = true; }
    else if (audience_type === 'drivers') { target.allDrivers = true; }
    else if (audience_type === 'roles') { target.roles = roles; }
    else if (audience_type === 'user' && user_id) { target.userId = user_id; }
    else if (audience_type === 'driver' && driver_id) { target.driverId = driver_id; }

    const result = await notificationService.send({
      title: title.trim(),
      message: message.trim(),
      category,
      priority,
      deliveryChannel: delivery_channel,
      module: 'announcement',
      eventKey: 'announcement',
      triggeredBy: req.user?.id || null,
      target
    });

    res.json({
      message: 'Announcement sent successfully',
      recipients: result.recipients
    });
  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Backward-compatible broadcast endpoint (drivers only)
const broadcastNotification = async (req, res) => {
  try {
    const { title, message, notification_type = 'System' } = req.body;
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: 'Title and message are required' });
    }
    const channel = notification_type === 'Email' ? 'Both' : 'System';
    const result = await notificationService.send({
      title: title.trim(),
      message: message.trim(),
      category: 'Information',
      priority: 'Medium',
      deliveryChannel: channel,
      module: 'announcement',
      eventKey: 'announcement',
      triggeredBy: req.user?.id || null,
      target: { allDrivers: true }
    });
    res.json({ message: 'Notification sent to all drivers', recipients: result.recipients, sent: result.recipients, failed: 0 });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// -------- Scheduled notifications --------

const scheduleNotification = async (req, res) => {
  try {
    const {
      title, message, category = 'Information', priority = 'Medium',
      delivery_channel = 'System', audience_type = 'all', roles = [],
      user_id, scheduled_at
    } = req.body;

    if (!title?.trim() || !message?.trim() || !scheduled_at) {
      return res.status(400).json({ message: 'Title, message and scheduled time are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO scheduled_notifications
        (title, message, category, priority, delivery_channel, audience_type, audience_roles, audience_user_id, scheduled_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [
        title.trim(), message.trim(), category, priority, delivery_channel,
        audience_type, Array.isArray(roles) ? roles.join(',') : null,
        user_id || null, scheduled_at, req.user?.id || null
      ]
    );
    res.status(201).json({ message: 'Notification scheduled', scheduled_id: result.insertId });
  } catch (error) {
    console.error('Schedule notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getScheduledNotifications = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, u.full_name AS created_by_name
       FROM scheduled_notifications s
       LEFT JOIN users u ON s.created_by = u.user_id
       ORDER BY s.scheduled_at DESC`
    );
    res.json({ scheduled: rows });
  } catch (error) {
    console.error('Get scheduled notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const cancelScheduledNotification = async (req, res) => {
  try {
    await pool.query(
      "UPDATE scheduled_notifications SET status = 'Cancelled' WHERE scheduled_id = ? AND status = 'Pending'",
      [req.params.id]
    );
    res.json({ message: 'Scheduled notification cancelled' });
  } catch (error) {
    console.error('Cancel scheduled notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// -------- Archive & export --------

const archiveOld = async (req, res) => {
  try {
    const days = parseInt(req.body.days || req.query.days || 90);
    const affected = await Notification.archiveOlderThan(days);
    res.json({ message: `Archived notifications older than ${days} days`, archived: affected });
  } catch (error) {
    console.error('Archive old error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const exportLogs = async (req, res) => {
  try {
    const notifications = await Notification.findAll({ includeArchived: true, limit: 100, ...req.query });
    const headers = ['ID', 'Title', 'Category', 'Priority', 'Channel', 'Status', 'Module', 'Created At'];
    const rows = notifications.map((n) => [
      n.id,
      `"${String(n.title || '').replace(/"/g, '""')}"`,
      n.category, n.priority, n.delivery_channel, n.status,
      n.related_module || '', n.created_at
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="notification-logs.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// -------- Preferences --------

const getPreferences = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT in_app_enabled, email_enabled FROM notification_preferences WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );
    res.json({ preferences: rows[0] || { in_app_enabled: 1, email_enabled: 1 } });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const inApp = req.body.in_app_enabled ? 1 : 0;
    const email = req.body.email_enabled ? 1 : 0;
    await pool.query(
      `INSERT INTO notification_preferences (user_id, in_app_enabled, email_enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE in_app_enabled = VALUES(in_app_enabled), email_enabled = VALUES(email_enabled), updated_at = NOW()`,
      [req.user.id, inApp, email]
    );
    res.json({ message: 'Preferences updated' });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  getNotificationById,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  archiveNotification,
  getAllNotifications,
  getEmailLogs,
  retryEmail,
  sendAnnouncement,
  broadcastNotification,
  scheduleNotification,
  getScheduledNotifications,
  cancelScheduledNotification,
  archiveOld,
  exportLogs,
  getPreferences,
  updatePreferences
};
