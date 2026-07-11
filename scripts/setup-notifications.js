/*
 * DLMS11 Notification System - Database Migration
 * ------------------------------------------------
 * - Extends the existing `notifications` table (kept backward compatible)
 * - Creates supporting tables: email_logs, notification_templates,
 *   scheduled_notifications, notification_preferences
 * - Seeds default event templates
 *
 * Run:  node scripts/setup-notifications.js
 */
const pool = require('../config/database');

// Helper: add a column only if it does not already exist (MariaDB/MySQL safe)
async function addColumnIfMissing(table, column, definition) {
  const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (cols.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    console.log(`  + ${table}.${column} added`);
  } else {
    console.log(`  = ${table}.${column} already exists`);
  }
}

async function ensureIndex(table, indexName, columns) {
  const [idx] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
  if (idx.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`);
    console.log(`  + index ${indexName} added on ${table}`);
  }
}

const DEFAULT_TEMPLATES = [
  // key, category, priority, channel, module, title, message, email_subject, email_body
  ['driver.account_created', 'Success', 'Medium', 'Both', 'drivers',
    'Account Created', 'Your DLMS account has been created successfully.',
    'Welcome to DLMS', 'Dear {{name}}, your DLMS account has been created successfully.'],
  ['driver.license_application_received', 'Information', 'Medium', 'Both', 'licenses',
    'License Application Received', 'We have received your license application {{ref}}.',
    'License Application Received', 'Dear {{name}}, we have received your license application {{ref}}.'],
  ['driver.appointment_confirmed', 'Success', 'Medium', 'Both', 'appointments',
    'Appointment Confirmed', 'Your {{type}} appointment is confirmed for {{date}}.',
    'Appointment Confirmed', 'Dear {{name}}, your {{type}} appointment is confirmed for {{date}} at {{center}}.'],
  ['driver.appointment_rescheduled', 'Warning', 'Medium', 'Both', 'appointments',
    'Appointment Rescheduled', 'Your appointment has been rescheduled to {{date}}.',
    'Appointment Rescheduled', 'Dear {{name}}, your appointment has been rescheduled to {{date}}.'],
  ['driver.appointment_cancelled', 'Warning', 'High', 'Both', 'appointments',
    'Appointment Cancelled', 'Your {{type}} appointment on {{date}} has been cancelled.',
    'Appointment Cancelled', 'Dear {{name}}, your {{type}} appointment on {{date}} has been cancelled.'],
  ['driver.exam_reminder', 'Information', 'High', 'Both', 'exams',
    'Exam Reminder', 'Reminder: your {{type}} exam is scheduled for {{date}}.',
    'Exam Reminder', 'Dear {{name}}, this is a reminder that your {{type}} exam is scheduled for {{date}}.'],
  ['driver.exam_result', 'Information', 'High', 'Both', 'exams',
    'Exam Result: {{result}}', 'Your {{type}} exam result is {{result}} (score: {{score}}).',
    'Your Exam Result', 'Dear {{name}}, your {{type}} exam result is {{result}} with a score of {{score}}.'],
  ['driver.license_approved', 'Success', 'High', 'Both', 'licenses',
    'License Approved', 'Congratulations! Your license {{ref}} has been approved.',
    'License Approved', 'Dear {{name}}, congratulations! Your license {{ref}} has been approved.'],
  ['driver.license_rejected', 'Error', 'High', 'Both', 'licenses',
    'License Rejected', 'Your license application {{ref}} was rejected. {{reason}}',
    'License Application Rejected', 'Dear {{name}}, your license application {{ref}} was rejected. {{reason}}'],
  ['driver.license_ready', 'Success', 'Medium', 'Both', 'licenses',
    'License Ready for Collection', 'Your license {{ref}} is ready for collection.',
    'License Ready for Collection', 'Dear {{name}}, your license {{ref}} is ready for collection.'],
  ['driver.payment_successful', 'Success', 'Medium', 'Both', 'payments',
    'Payment Successful', 'Your payment of {{amount}} was received. Ref: {{ref}}.',
    'Payment Receipt', 'Dear {{name}}, your payment of {{amount}} was received successfully. Reference: {{ref}}.'],
  ['driver.password_changed', 'Warning', 'High', 'Both', 'users',
    'Password Changed', 'Your account password was changed. If this was not you, contact support.',
    'Password Changed', 'Dear {{name}}, your account password was just changed. If this was not you, please contact support immediately.'],
  ['driver.security_login_alert', 'Warning', 'High', 'Both', 'users',
    'New Login Detected', 'A new login to your account was detected from {{ip}}.',
    'Security Alert: New Login', 'Dear {{name}}, a new login to your account was detected from {{ip}} at {{time}}.'],

  // Examiner
  ['examiner.new_exam_assigned', 'Information', 'Medium', 'Both', 'exams',
    'New Exam Assigned', 'A new {{type}} exam has been assigned to you for {{date}}.',
    'New Exam Assigned', 'A new {{type}} exam has been assigned to you for {{date}}.'],
  ['examiner.schedule_updated', 'Information', 'Medium', 'System', 'exams',
    'Schedule Updated', 'Your examination schedule has been updated.',
    'Schedule Updated', 'Your examination schedule has been updated.'],
  ['examiner.exam_cancelled', 'Warning', 'Medium', 'Both', 'exams',
    'Exam Cancelled', 'A scheduled exam has been cancelled.',
    'Exam Cancelled', 'A scheduled exam has been cancelled.'],

  // Cashier
  ['cashier.new_payment_waiting', 'Information', 'Medium', 'System', 'payments',
    'New Payment Waiting', 'A new payment of {{amount}} is awaiting processing.',
    'New Payment Waiting', 'A new payment of {{amount}} is awaiting processing.'],
  ['cashier.refund_request', 'Warning', 'High', 'Both', 'payments',
    'Refund Request', 'A refund request of {{amount}} has been submitted.',
    'Refund Request', 'A refund request of {{amount}} has been submitted.'],
  ['cashier.daily_summary', 'Information', 'Low', 'Both', 'payments',
    'Daily Payment Summary', 'Total collected today: {{amount}} across {{count}} transactions.',
    'Daily Payment Summary', 'Total collected today: {{amount}} across {{count}} transactions.'],

  // Admin
  ['admin.new_driver_registered', 'Information', 'Medium', 'System', 'drivers',
    'New Driver Registered', '{{name}} has registered as a new driver.',
    'New Driver Registered', '{{name}} has registered as a new driver.'],
  ['admin.exam_results_submitted', 'Information', 'Medium', 'System', 'exams',
    'Exam Results Submitted', 'Exam results for {{name}} have been submitted.',
    'Exam Results Submitted', 'Exam results for {{name}} have been submitted.'],
  ['admin.payment_completed', 'Success', 'Low', 'System', 'payments',
    'Payment Completed', 'A payment of {{amount}} has been completed.',
    'Payment Completed', 'A payment of {{amount}} has been completed.'],
  ['admin.license_awaiting_approval', 'Warning', 'High', 'System', 'licenses',
    'License Awaiting Approval', 'License {{ref}} is awaiting your approval.',
    'License Awaiting Approval', 'License {{ref}} is awaiting your approval.'],
  ['admin.security_alert', 'Error', 'Critical', 'Both', 'security',
    'Security Alert', '{{message}}', 'Security Alert', '{{message}}'],
  ['admin.system_error', 'Error', 'Critical', 'Both', 'system',
    'System Error', '{{message}}', 'System Error', '{{message}}'],

  // Super Admin
  ['superadmin.user_created', 'Information', 'Medium', 'System', 'users',
    'User Created', 'A new user {{name}} ({{role}}) was created.',
    'User Created', 'A new user {{name}} ({{role}}) was created.'],
  ['superadmin.user_updated', 'Information', 'Low', 'System', 'users',
    'User Updated', 'User {{name}} was updated.', 'User Updated', 'User {{name}} was updated.'],
  ['superadmin.user_deleted', 'Warning', 'High', 'System', 'users',
    'User Deleted', 'User {{name}} was deleted.', 'User Deleted', 'User {{name}} was deleted.'],
  ['superadmin.role_changed', 'Warning', 'High', 'System', 'roles',
    'Role Changed', 'Role/permissions were changed: {{message}}.',
    'Role Changed', 'Role/permissions were changed: {{message}}.'],
  ['superadmin.backup_completed', 'Success', 'Medium', 'Both', 'system',
    'Backup Completed', 'Database backup completed successfully.',
    'Backup Completed', 'Database backup completed successfully.'],
  ['superadmin.backup_failed', 'Error', 'Critical', 'Both', 'system',
    'Backup Failed', 'Database backup failed. {{message}}',
    'Backup Failed', 'Database backup failed. {{message}}'],
  ['superadmin.audit_alert', 'Warning', 'High', 'System', 'audit',
    'Audit Log Alert', '{{message}}', 'Audit Log Alert', '{{message}}'],
  ['superadmin.storage_warning', 'Warning', 'High', 'Both', 'system',
    'Storage Warning', 'Storage usage is high: {{message}}',
    'Storage Warning', 'Storage usage is high: {{message}}'],

  // Reminders
  ['driver.appointment_reminder', 'Information', 'High', 'Both', 'appointments',
    'Upcoming Appointment Reminder', 'Reminder: your {{type}} appointment is scheduled for {{date}}.',
    'Upcoming Appointment Reminder', 'Dear {{name}}, this is a reminder that your {{type}} appointment is scheduled for {{date}} at {{center}}.'],
  ['driver.license_expiry_reminder', 'Warning', 'High', 'Both', 'licenses',
    'License Expiring Soon', 'Your license {{ref}} will expire on {{date}}. Please renew it to avoid penalties.',
    'License Expiring Soon', 'Dear {{name}}, your license {{ref}} will expire on {{date}}. Please renew it before the expiry date to avoid penalties.'],

  // Generic announcement
  ['announcement', 'Information', 'Medium', 'Both', 'announcement',
    '{{title}}', '{{message}}', '{{title}}', '{{message}}'],
];

async function setup() {
  try {
    console.log('Extending notifications table...');
    await addColumnIfMissing('notifications', 'user_id', '`user_id` INT DEFAULT NULL AFTER `notification_id`');
    await addColumnIfMissing('notifications', 'category', "`category` ENUM('Information','Success','Warning','Error') DEFAULT 'Information'");
    await addColumnIfMissing('notifications', 'priority', "`priority` ENUM('Low','Medium','High','Critical') DEFAULT 'Medium'");
    await addColumnIfMissing('notifications', 'delivery_channel', "`delivery_channel` ENUM('System','Email','Both') DEFAULT 'System'");
    await addColumnIfMissing('notifications', 'status', "`status` ENUM('Pending','Sent','Failed','Read') DEFAULT 'Sent'");
    await addColumnIfMissing('notifications', 'triggered_by', '`triggered_by` INT DEFAULT NULL');
    await addColumnIfMissing('notifications', 'related_module', '`related_module` VARCHAR(50) DEFAULT NULL');
    await addColumnIfMissing('notifications', 'related_record_id', '`related_record_id` INT DEFAULT NULL');
    await addColumnIfMissing('notifications', 'related_link', '`related_link` VARCHAR(255) DEFAULT NULL');
    await addColumnIfMissing('notifications', 'event_key', '`event_key` VARCHAR(100) DEFAULT NULL');
    await addColumnIfMissing('notifications', 'read_at', '`read_at` DATETIME DEFAULT NULL');
    await addColumnIfMissing('notifications', 'scheduled_at', '`scheduled_at` DATETIME DEFAULT NULL');
    await addColumnIfMissing('notifications', 'sent_at', '`sent_at` DATETIME DEFAULT NULL');
    await addColumnIfMissing('notifications', 'archived', '`archived` TINYINT(1) DEFAULT 0');
    await addColumnIfMissing('notifications', 'updated_at', '`updated_at` TIMESTAMP NULL DEFAULT NULL');
    await ensureIndex('notifications', 'idx_notif_user', '`user_id`');
    await ensureIndex('notifications', 'idx_notif_driver', '`driver_id`');
    await ensureIndex('notifications', 'idx_notif_archived', '`archived`');

    console.log('Creating email_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        email_log_id INT AUTO_INCREMENT PRIMARY KEY,
        notification_id INT DEFAULT NULL,
        recipient_email VARCHAR(150) NOT NULL,
        subject VARCHAR(255) DEFAULT NULL,
        body MEDIUMTEXT DEFAULT NULL,
        status ENUM('Pending','Sent','Failed') DEFAULT 'Pending',
        error_message TEXT DEFAULT NULL,
        provider VARCHAR(50) DEFAULT 'smtp',
        attempts INT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME DEFAULT NULL,
        INDEX idx_email_notif (notification_id),
        INDEX idx_email_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    console.log('Creating notification_templates table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        template_id INT AUTO_INCREMENT PRIMARY KEY,
        event_key VARCHAR(100) NOT NULL UNIQUE,
        category ENUM('Information','Success','Warning','Error') DEFAULT 'Information',
        priority ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
        delivery_channel ENUM('System','Email','Both') DEFAULT 'System',
        related_module VARCHAR(50) DEFAULT NULL,
        title VARCHAR(255) DEFAULT NULL,
        message_template TEXT DEFAULT NULL,
        email_subject VARCHAR(255) DEFAULT NULL,
        email_body_template TEXT DEFAULT NULL,
        enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    console.log('Creating scheduled_notifications table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_notifications (
        scheduled_id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        category ENUM('Information','Success','Warning','Error') DEFAULT 'Information',
        priority ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
        delivery_channel ENUM('System','Email','Both') DEFAULT 'System',
        audience_type ENUM('all','roles','user') DEFAULT 'all',
        audience_roles VARCHAR(255) DEFAULT NULL,
        audience_user_id INT DEFAULT NULL,
        scheduled_at DATETIME NOT NULL,
        status ENUM('Pending','Sent','Cancelled','Failed') DEFAULT 'Pending',
        created_by INT DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME DEFAULT NULL,
        INDEX idx_sched_status (status),
        INDEX idx_sched_time (scheduled_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    console.log('Creating notification_preferences table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        pref_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        in_app_enabled TINYINT(1) DEFAULT 1,
        email_enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    console.log('Seeding default templates...');
    for (const t of DEFAULT_TEMPLATES) {
      const [key, category, priority, channel, module, title, message, subject, body] = t;
      await pool.query(
        `INSERT INTO notification_templates
          (event_key, category, priority, delivery_channel, related_module, title, message_template, email_subject, email_body_template)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           category = VALUES(category), priority = VALUES(priority),
           delivery_channel = VALUES(delivery_channel), related_module = VALUES(related_module),
           title = VALUES(title), message_template = VALUES(message_template),
           email_subject = VALUES(email_subject), email_body_template = VALUES(email_body_template),
           updated_at = NOW()`,
        [key, category, priority, channel, module, title, message, subject, body]
      );
    }
    console.log(`  ${DEFAULT_TEMPLATES.length} templates seeded`);

    console.log('\nNotification system migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

setup();
