/**
 * ReminderService - automatically generates appointment and license-expiry reminders.
 *
 * Appointment reminders: 24 hours, 1 hour, and 15 minutes before appointment_date.
 * License expiry reminders: 30 days before expiry_date.
 *
 * Deduplication is tracked on the appointments and licenses tables using flag columns
 * added by scripts/setup-reminders.js.
 */
const pool = require('../config/database');
const notificationService = require('./notificationService');

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const sendAppointmentReminder = async (appointment, windowName, minutesBefore) => {
  const driver = {
    name: `${appointment.first_name || ''} ${appointment.last_name || ''}`.trim() || 'Driver',
    email: appointment.email,
    phone: appointment.phone,
    driverId: appointment.driver_id,
    userId: null
  };

  if (appointment.email) {
    const [users] = await pool.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [appointment.email]);
    if (users[0]) driver.userId = users[0].user_id;
  }

  const whenText = windowName === '15min' ? 'in 15 minutes' : windowName === '1h' ? 'in 1 hour' : 'tomorrow';

  await notificationService.send({
    title: `Upcoming Appointment Reminder`,
    message: `Reminder: Your ${appointment.appointment_type || 'appointment'} is scheduled ${whenText} at ${appointment.center_name || 'DLMS Center'} on ${formatDateTime(appointment.appointment_date)}.`,
    category: 'Information',
    priority: windowName === '15min' ? 'High' : 'Medium',
    deliveryChannel: 'Both',
    module: 'appointments',
    eventKey: 'driver.appointment_reminder',
    triggeredBy: null,
    target: driver.userId || driver.driverId ? { userId: driver.userId || undefined, driverId: driver.driverId } : undefined
  });
};

const processAppointmentReminders = async () => {
  const now = new Date();

  // 24-hour window: due between 23h30m and 24h30m from now
  const [appt24h] = await pool.query(
    `SELECT * FROM appointments
     WHERE reminder_24h_sent = 0
       AND status IN ('Pending','Approved')
       AND appointment_date BETWEEN DATE_ADD(NOW(), INTERVAL 23 HOUR) AND DATE_ADD(NOW(), INTERVAL 25 HOUR)
     ORDER BY appointment_date ASC`
  );

  for (const a of appt24h) {
    try {
      await sendAppointmentReminder(a, '24h', 24 * 60);
      await pool.query('UPDATE appointments SET reminder_24h_sent = 1 WHERE appointment_id = ?', [a.appointment_id]);
    } catch (err) {
      console.error(`Reminder 24h failed for appointment ${a.appointment_id}:`, err.message);
    }
  }

  // 1-hour window
  const [appt1h] = await pool.query(
    `SELECT * FROM appointments
     WHERE reminder_1h_sent = 0
       AND status IN ('Pending','Approved')
       AND appointment_date BETWEEN DATE_ADD(NOW(), INTERVAL 50 MINUTE) AND DATE_ADD(NOW(), INTERVAL 70 MINUTE)
     ORDER BY appointment_date ASC`
  );

  for (const a of appt1h) {
    try {
      await sendAppointmentReminder(a, '1h', 60);
      await pool.query('UPDATE appointments SET reminder_1h_sent = 1 WHERE appointment_id = ?', [a.appointment_id]);
    } catch (err) {
      console.error(`Reminder 1h failed for appointment ${a.appointment_id}:`, err.message);
    }
  }

  // 15-minute window
  const [appt15min] = await pool.query(
    `SELECT * FROM appointments
     WHERE reminder_15min_sent = 0
       AND status IN ('Pending','Approved')
       AND appointment_date BETWEEN DATE_ADD(NOW(), INTERVAL 5 MINUTE) AND DATE_ADD(NOW(), INTERVAL 30 MINUTE)
     ORDER BY appointment_date ASC`
  );

  for (const a of appt15min) {
    try {
      await sendAppointmentReminder(a, '15min', 15);
      await pool.query('UPDATE appointments SET reminder_15min_sent = 1 WHERE appointment_id = ?', [a.appointment_id]);
    } catch (err) {
      console.error(`Reminder 15min failed for appointment ${a.appointment_id}:`, err.message);
    }
  }
};

const sendLicenseExpiryReminder = async (license) => {
  const [driverRows] = await pool.query(
    'SELECT driver_id, first_name, last_name, email, phone FROM drivers WHERE driver_id = ? LIMIT 1',
    [license.driver_id]
  );
  const driver = driverRows[0];
  if (!driver || !driver.email) return;

  const name = `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || 'Driver';

  const [users] = await pool.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [driver.email]);
  const userId = users[0]?.user_id || null;

  await notificationService.send({
    title: 'License Expiring Soon',
    message: `Dear ${name}, your license ${license.license_number || ''} will expire on ${license.expiry_date ? new Date(license.expiry_date).toLocaleDateString() : 'N/A'}. Please renew it before the expiry date to avoid penalties.`,
    category: 'Warning',
    priority: 'High',
    deliveryChannel: 'Both',
    module: 'licenses',
    eventKey: 'driver.license_expiry_reminder',
    triggeredBy: null,
    target: userId ? { userId, driverId: driver.driver_id } : { driverId: driver.driver_id }
  });
};

const processLicenseExpiryReminders = async () => {
  const [licenses] = await pool.query(
    `SELECT * FROM licenses
     WHERE expiry_reminder_sent = 0
       AND license_status IN ('Active','Pending')
       AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
     ORDER BY expiry_date ASC`
  );

  for (const l of licenses) {
    try {
      await sendLicenseExpiryReminder(l);
      await pool.query('UPDATE licenses SET expiry_reminder_sent = 1 WHERE license_id = ?', [l.license_id]);
    } catch (err) {
      console.error(`License expiry reminder failed for license ${l.license_id}:`, err.message);
    }
  }
};

const processDue = async () => {
  try {
    await processAppointmentReminders();
  } catch (err) {
    console.error('Appointment reminder processing error:', err.message);
  }
  try {
    await processLicenseExpiryReminders();
  } catch (err) {
    console.error('License expiry reminder processing error:', err.message);
  }
  try {
    const Appointment = require('../models/Appointment');
    const noShowCount = await Appointment.autoMarkNoShow();
    if (noShowCount) console.log(`Auto-marked ${noShowCount} appointment(s) as No Show`);
  } catch (err) {
    console.error('Auto no-show error:', err.message);
  }
};

module.exports = { processDue };
