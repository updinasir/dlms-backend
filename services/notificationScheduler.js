/*
 * NotificationScheduler - processes due scheduled_notifications rows.
 * Runs on an interval and dispatches any Pending notification whose
 * scheduled_at time has passed via the notificationService.
 */
const pool = require('../config/database');
const notificationService = require('./notificationService');
const reminderService = require('./reminderService');

const buildTarget = (row) => {
  switch (row.audience_type) {
    case 'all':
      return { allUsers: true, allDrivers: true };
    case 'staff':
      return { allUsers: true };
    case 'drivers':
      return { allDrivers: true };
    case 'roles':
      return { roles: (row.audience_roles || '').split(',').map((r) => Number(r)).filter(Boolean) };
    case 'user':
      return { userId: row.audience_user_id };
    default:
      return { allUsers: true };
  }
};

const processDue = async () => {
  try {
    // Auto-reminders for appointments and expiring licenses
    await reminderService.processDue();
  } catch (err) {
    console.error('Reminder service error:', err.message);
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM scheduled_notifications WHERE status = 'Pending' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC LIMIT 20"
    );
    for (const row of rows) {
      try {
        await notificationService.send({
          title: row.title,
          message: row.message,
          category: row.category,
          priority: row.priority,
          deliveryChannel: row.delivery_channel,
          module: 'announcement',
          eventKey: 'announcement',
          triggeredBy: row.created_by,
          target: buildTarget(row)
        });
        await pool.query(
          "UPDATE scheduled_notifications SET status = 'Sent', sent_at = NOW() WHERE scheduled_id = ?",
          [row.scheduled_id]
        );
      } catch (err) {
        console.error(`Scheduled notification ${row.scheduled_id} failed:`, err.message);
        await pool.query(
          "UPDATE scheduled_notifications SET status = 'Failed' WHERE scheduled_id = ?",
          [row.scheduled_id]
        );
      }
    }
  } catch (err) {
    console.error('Notification scheduler error:', err.message);
  }
};

let timer = null;
const start = (intervalMs = 60000) => {
  if (timer) return;
  // Delay first run slightly so the DB pool is ready
  setTimeout(processDue, 5000);
  timer = setInterval(processDue, intervalMs);
  console.log('Notification scheduler started');
};

module.exports = { start, processDue };
