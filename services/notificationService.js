/*
 * NotificationService - central, modular notification engine for DLMS11.
 *
 * Responsibilities:
 *  - Resolve recipients (specific user, specific driver, by role, or all)
 *  - Render templates (event-key based) with variable substitution
 *  - Persist the in-app notification row
 *  - Fan out to enabled delivery channels (system, email; sms-ready)
 *  - Record status per notification
 *
 * Adding a new channel later (SMS/Push/WhatsApp) only requires creating a
 * channel adapter and registering it below - no call sites change.
 */
const pool = require('../config/database');
const systemChannel = require('./channels/systemChannel');
const emailChannel = require('./channels/emailChannel');
const smsChannel = require('./channels/smsChannel');

// Channel registry - future channels are added here only.
const channels = {
  system: systemChannel,
  email: emailChannel,
  sms: smsChannel
};

const ROLE_IDS = {
  super_admin: 1,
  admin: 2,
  examiner: 3,
  staff: 4,
  cashier: 5,
  driver: 6
};

// Render a template string, replacing {{var}} with data values.
const render = (template, data = {}) => {
  if (!template) return '';
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : ''
  );
};

const getTemplate = async (eventKey) => {
  if (!eventKey) return null;
  const [rows] = await pool.query(
    'SELECT * FROM notification_templates WHERE event_key = ? AND enabled = 1 LIMIT 1',
    [eventKey]
  );
  return rows[0] || null;
};

const getUserPreference = async (userId) => {
  if (!userId) return { in_app_enabled: 1, email_enabled: 1 };
  const [rows] = await pool.query(
    'SELECT in_app_enabled, email_enabled FROM notification_preferences WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || { in_app_enabled: 1, email_enabled: 1 };
};

/*
 * Resolve a list of recipient objects: { user_id, driver_id, email, name }
 */
const resolveRecipients = async (target = {}) => {
  const recipients = [];

  // Specific staff/user by id
  if (target.userId) {
    const [rows] = await pool.query(
      'SELECT user_id, full_name AS name, email FROM users WHERE user_id = ? LIMIT 1',
      [target.userId]
    );
    if (rows[0]) recipients.push({ user_id: rows[0].user_id, driver_id: null, email: rows[0].email, name: rows[0].name });
  }

  // Specific driver by id (also link their user account by email if present)
  if (target.driverId) {
    const [rows] = await pool.query(
      'SELECT driver_id, CONCAT(first_name, " ", last_name) AS name, email FROM drivers WHERE driver_id = ? LIMIT 1',
      [target.driverId]
    );
    if (rows[0]) {
      let linkedUserId = null;
      if (rows[0].email) {
        const [u] = await pool.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [rows[0].email]);
        linkedUserId = u[0]?.user_id || null;
      }
      recipients.push({ user_id: linkedUserId, driver_id: rows[0].driver_id, email: rows[0].email, name: rows[0].name });
    }
  }

  // By role(s) - staff users
  if (target.roles && target.roles.length) {
    const roleIds = target.roles.map((r) => (typeof r === 'number' ? r : ROLE_IDS[r])).filter(Boolean);
    if (roleIds.length) {
      const placeholders = roleIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT user_id, full_name AS name, email FROM users WHERE role_id IN (${placeholders}) AND status = 'Active'`,
        roleIds
      );
      rows.forEach((r) => recipients.push({ user_id: r.user_id, driver_id: null, email: r.email, name: r.name }));
    }
  }

  // All staff users
  if (target.allUsers) {
    const [rows] = await pool.query("SELECT user_id, full_name AS name, email FROM users WHERE status = 'Active'");
    rows.forEach((r) => recipients.push({ user_id: r.user_id, driver_id: null, email: r.email, name: r.name }));
  }

  // All drivers
  if (target.allDrivers) {
    const [rows] = await pool.query('SELECT driver_id, CONCAT(first_name, " ", last_name) AS name, email FROM drivers');
    rows.forEach((r) => recipients.push({ user_id: null, driver_id: r.driver_id, email: r.email, name: r.name }));
  }

  // De-duplicate by user_id/driver_id combination
  const seen = new Set();
  return recipients.filter((r) => {
    const key = `${r.user_id || 'u0'}-${r.driver_id || 'd0'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/*
 * Deliver a single notification to a single recipient across channels.
 */
const deliverOne = async (recipient, notif) => {
  const pref = await getUserPreference(recipient.user_id);
  const channel = notif.delivery_channel || 'System';

  const wantSystem = channel === 'System' || channel === 'Both';
  const wantEmail = channel === 'Email' || channel === 'Both';

  let systemStatus = null;
  let emailStatus = null;
  let notificationId = null;

  // 1. In-app (respect user preference)
  if (wantSystem && pref.in_app_enabled) {
    const [result] = await pool.query(
      `INSERT INTO notifications
        (user_id, driver_id, title, message, notification_type, category, priority,
         delivery_channel, status, triggered_by, related_module, related_record_id,
         related_link, event_key, is_read, created_at, sent_at)
       VALUES (?, ?, ?, ?, 'System', ?, ?, ?, 'Sent', ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [
        recipient.user_id || null,
        recipient.driver_id || null,
        notif.title,
        notif.message,
        notif.category,
        notif.priority,
        notif.delivery_channel,
        notif.triggered_by || null,
        notif.related_module || null,
        notif.related_record_id || null,
        notif.related_link || null,
        notif.event_key || null
      ]
    );
    notificationId = result.insertId;
    systemStatus = 'Sent';
  }

  // 2. Email (respect user preference + channel availability)
  if (wantEmail && pref.email_enabled && channels.email.isEnabled()) {
    const res = await channels.email.send({
      recipient,
      notification: { ...notif, notification_id: notificationId }
    });
    emailStatus = res.status;
    if (notificationId && res.status === 'Failed') {
      await pool.query('UPDATE notifications SET status = ? WHERE notification_id = ?', ['Failed', notificationId]);
    }
  }

  return { notificationId, systemStatus, emailStatus };
};

/*
 * Public: notify by explicit content (no template).
 * options: { title, message, category, priority, deliveryChannel, module,
 *            recordId, link, triggeredBy, target }
 */
const send = async (options = {}) => {
  const notif = {
    title: options.title,
    message: options.message,
    category: options.category || 'Information',
    priority: options.priority || 'Medium',
    delivery_channel: options.deliveryChannel || 'System',
    related_module: options.module || null,
    related_record_id: options.recordId || null,
    related_link: options.link || null,
    event_key: options.eventKey || null,
    email_subject: options.emailSubject || null,
    email_body: options.emailBody || null,
    triggered_by: options.triggeredBy || null
  };

  const recipients = await resolveRecipients(options.target || {});
  const results = [];
  for (const recipient of recipients) {
    try {
      const r = await deliverOne(recipient, notif);
      results.push({ recipient, ...r });
    } catch (err) {
      console.error('Notification delivery error:', err.message);
      results.push({ recipient, error: err.message });
    }
  }
  return { recipients: recipients.length, results };
};

/*
 * Public: notify using a stored template + variable data.
 * eventKey resolves category/priority/channel/module and title/message text.
 */
const notify = async (eventKey, { data = {}, target = {}, triggeredBy = null, overrides = {} } = {}) => {
  const tpl = await getTemplate(eventKey);
  if (!tpl) {
    // Fallback: if no template, use overrides directly (never throws to caller)
    if (overrides.title && overrides.message) {
      return send({ ...overrides, eventKey, triggeredBy, target });
    }
    console.warn(`No notification template for event: ${eventKey}`);
    return { recipients: 0, results: [] };
  }

  return send({
    title: render(tpl.title, data),
    message: render(tpl.message_template, data),
    emailSubject: render(tpl.email_subject, data),
    emailBody: render(tpl.email_body_template, data),
    category: overrides.category || tpl.category,
    priority: overrides.priority || tpl.priority,
    deliveryChannel: overrides.deliveryChannel || tpl.delivery_channel,
    module: overrides.module || tpl.related_module,
    recordId: overrides.recordId || data.recordId || null,
    link: overrides.link || data.link || null,
    eventKey,
    triggeredBy,
    target
  });
};

// Convenience helpers
const notifyUser = (userId, opts) => notify(opts.eventKey, { ...opts, target: { userId } });
const notifyDriver = (driverId, opts) => notify(opts.eventKey, { ...opts, target: { driverId } });
const notifyRoles = (roles, opts) => notify(opts.eventKey, { ...opts, target: { roles } });
const notifyAdmins = (opts) => notify(opts.eventKey, { ...opts, target: { roles: ['super_admin', 'admin'] } });
const notifySuperAdmins = (opts) => notify(opts.eventKey, { ...opts, target: { roles: ['super_admin'] } });

// Fire-and-forget wrapper so triggers never break core request flows.
const safeNotify = (...args) => {
  notify(...args).catch((err) => console.error('safeNotify error:', err.message));
};

module.exports = {
  channels,
  ROLE_IDS,
  render,
  resolveRecipients,
  send,
  notify,
  notifyUser,
  notifyDriver,
  notifyRoles,
  notifyAdmins,
  notifySuperAdmins,
  safeNotify
};
