const pool = require('../config/database');

async function runMigrations() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Add indexes for performance
    console.log('Adding indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_drivers_national_id ON drivers(national_id)',
      'CREATE INDEX IF NOT EXISTS idx_drivers_email ON drivers(email)',
      'CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)',
      'CREATE INDEX IF NOT EXISTS idx_licenses_driver_id ON licenses(driver_id)',
      'CREATE INDEX IF NOT EXISTS idx_licenses_license_number ON licenses(license_number)',
      'CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(license_status)',
      'CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON licenses(expiry_date)',
      'CREATE INDEX IF NOT EXISTS idx_payments_driver_id ON payments(driver_id)',
      'CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status)',
      'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)',
      'CREATE INDEX IF NOT EXISTS idx_appointments_driver_id ON appointments(driver_id)',
      'CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)',
      'CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)',
      'CREATE INDEX IF NOT EXISTS idx_practical_exams_driver_id ON practical_exams(driver_id)',
      'CREATE INDEX IF NOT EXISTS idx_theory_exams_driver_id ON theory_exams(driver_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_driver_id ON documents(driver_id)',
      'CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_driver_id ON notifications(driver_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time ON audit_logs(action_time)',
      'CREATE INDEX IF NOT EXISTS idx_appointments_overdue ON appointments(appointment_date, status)'
    ];

    for (const idx of indexes) {
      try {
        await connection.query(idx);
      } catch (e) {
        if (!e.message.includes('Duplicate')) {
          console.warn('Index warning:', e.message);
        }
      }
    }

    // Add missing columns for security and audit
    console.log('Adding missing columns...');
    const columnMigrations = [
      // Users table improvements
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS last_login DATETIME NULL AFTER status,
       ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0 AFTER last_login,
       ADD COLUMN IF NOT EXISTS lockout_until DATETIME NULL AFTER failed_login_attempts,
       ADD COLUMN IF NOT EXISTS password_changed_at DATETIME NULL AFTER lockout_until`,

      // Add session tracking
      `ALTER TABLE login_history
       ADD COLUMN IF NOT EXISTS session_token VARCHAR(255) NULL AFTER device_info,
       ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1 AFTER session_token`,

      // Add notification is_read index
      `ALTER TABLE notifications
       ADD COLUMN IF NOT EXISTS is_read TINYINT(1) DEFAULT 0 AFTER notification_type`,

      // Ensure appointments has notes column for additional info
      `ALTER TABLE appointments
       ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER center_name`
    ];

    for (const migration of columnMigrations) {
      try {
        await connection.query(migration);
      } catch (e) {
        console.warn('Migration warning:', e.message);
      }
    }

    // Unique constraints & defaults
    console.log('Adding unique constraints and defaults...');
    const constraints = [
      "ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)",
      "ALTER TABLE drivers ADD UNIQUE KEY uniq_drivers_national_id (national_id)",
      "ALTER TABLE licenses ADD UNIQUE KEY uniq_licenses_number (license_number)",
      "ALTER TABLE payments ADD UNIQUE KEY uniq_payments_txn_ref (transaction_reference)",
      // Default payment_status to Pending
      "ALTER TABLE payments ALTER payment_status SET DEFAULT 'Pending'"
    ];
    for (const sql of constraints) {
      try { await connection.query(sql); } catch (e) {
        if (!/Duplicate|exists|Cannot find/.test(e.message)) console.warn('Constraint warning:', e.message);
      }
    }

    // Foreign keys with cascade
    console.log('Adding foreign keys...');
    const fks = [
      "ALTER TABLE documents ADD CONSTRAINT fk_documents_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE",
      "ALTER TABLE licenses ADD CONSTRAINT fk_licenses_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE",
      "ALTER TABLE payments ADD CONSTRAINT fk_payments_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE"
    ];
    for (const sql of fks) {
      try { await connection.query(sql); } catch (e) {
        if (!/Duplicate|exists|errno: 1826|Can't create/.test(e.message)) console.warn('FK warning:', e.message);
      }
    }

    // Remove deprecated traffic_violations table
    console.log('Removing deprecated traffic_violations table...');
    try {
      await connection.query('DROP TABLE IF EXISTS traffic_violations');
      console.log('traffic_violations table removed');
    } catch (e) {
      console.warn('Could not drop traffic_violations:', e.message);
    }

    // Rename Police Officer role to Staff
    console.log('Renaming Police Officer role to Staff...');
    try {
      await connection.query("UPDATE roles SET role_name = 'Staff' WHERE role_name = 'Police Officer'");
      console.log('Role renamed to Staff');
    } catch (e) {
      console.warn('Could not rename role:', e.message);
    }

    // Enhanced user activity tracking
    console.log('Adding user activity tracking columns...');
    const activityTrackingMigrations = [
      // Users table enhancements
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50) NULL AFTER user_id,
       ADD COLUMN IF NOT EXISTS username VARCHAR(50) NULL AFTER employee_id,
       ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL AFTER role_id,
       ADD COLUMN IF NOT EXISTS branch_office VARCHAR(100) NULL AFTER department,
       ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(255) NULL AFTER branch_office,
       ADD COLUMN IF NOT EXISTS last_login DATETIME NULL AFTER status,
       ADD COLUMN IF NOT EXISTS last_password_change DATETIME NULL AFTER failed_login_attempts,
       ADD INDEX IF NOT EXISTS idx_users_employee_id (employee_id),
       ADD INDEX IF NOT EXISTS idx_users_username (username)`,

      // Login history enhancements
      `ALTER TABLE login_history
       ADD COLUMN IF NOT EXISTS status VARCHAR(20) NULL AFTER login_time,
       ADD COLUMN IF NOT EXISTS logout_time DATETIME NULL AFTER status,
       ADD COLUMN IF NOT EXISTS session_duration INT NULL AFTER logout_time,
       ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL AFTER device_info,
       ADD COLUMN IF NOT EXISTS browser VARCHAR(100) NULL AFTER user_agent,
       ADD COLUMN IF NOT EXISTS os VARCHAR(100) NULL AFTER browser,
       ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) NULL AFTER os,
       ADD COLUMN IF NOT EXISTS screen_resolution VARCHAR(50) NULL AFTER device_type,
       ADD COLUMN IF NOT EXISTS language VARCHAR(50) NULL AFTER screen_resolution,
       ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) NULL AFTER language,
       ADD COLUMN IF NOT EXISTS public_ip VARCHAR(64) NULL AFTER ip_address,
       ADD COLUMN IF NOT EXISTS local_ip VARCHAR(64) NULL AFTER public_ip,
       ADD COLUMN IF NOT EXISTS country VARCHAR(100) NULL AFTER local_ip,
       ADD COLUMN IF NOT EXISTS region VARCHAR(100) NULL AFTER country,
       ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL AFTER region,
       ADD COLUMN IF NOT EXISTS isp VARCHAR(255) NULL AFTER city,
       ADD COLUMN IF NOT EXISTS vpn_detected TINYINT(1) DEFAULT 0 AFTER isp,
       ADD COLUMN IF NOT EXISTS proxy_detected TINYINT(1) DEFAULT 0 AFTER vpn_detected,
       ADD COLUMN IF NOT EXISTS session_token VARCHAR(255) NULL AFTER proxy_detected,
       ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1 AFTER session_token,
       ADD INDEX IF NOT EXISTS idx_login_history_session_token (session_token),
       ADD INDEX IF NOT EXISTS idx_login_history_status (status),
       ADD INDEX IF NOT EXISTS idx_login_history_is_active (is_active)`,

      // Audit logs enhancements
      `ALTER TABLE audit_logs
       ADD COLUMN IF NOT EXISTS module VARCHAR(100) NULL AFTER action_performed,
       ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER module,
       ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL AFTER description,
       ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL AFTER ip_address,
       ADD COLUMN IF NOT EXISTS browser VARCHAR(100) NULL AFTER user_agent,
       ADD COLUMN IF NOT EXISTS os VARCHAR(100) NULL AFTER browser,
       ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) NULL AFTER os,
       ADD COLUMN IF NOT EXISTS session_id VARCHAR(255) NULL AFTER device_type,
       ADD COLUMN IF NOT EXISTS request_id VARCHAR(255) NULL AFTER session_id,
       ADD COLUMN IF NOT EXISTS status VARCHAR(20) NULL AFTER request_id,
       ADD COLUMN IF NOT EXISTS error_message TEXT NULL AFTER status,
       ADD COLUMN IF NOT EXISTS old_value JSON NULL AFTER error_message,
       ADD COLUMN IF NOT EXISTS new_value JSON NULL AFTER old_value,
       ADD COLUMN IF NOT EXISTS changed_fields JSON NULL AFTER new_value,
       ADD COLUMN IF NOT EXISTS geo_location VARCHAR(255) NULL AFTER changed_fields,
       ADD COLUMN IF NOT EXISTS digital_signature VARCHAR(255) NULL AFTER geo_location,
       ADD INDEX IF NOT EXISTS idx_audit_logs_module (module),
       ADD INDEX IF NOT EXISTS idx_audit_logs_status (status),
       ADD INDEX IF NOT EXISTS idx_audit_logs_session_id (session_id)`,

      // User sessions table
      `CREATE TABLE IF NOT EXISTS user_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id INT NOT NULL,
        login_time DATETIME NOT NULL,
        logout_time DATETIME NULL,
        duration INT NULL,
        ip_address VARCHAR(64) NULL,
        public_ip VARCHAR(64) NULL,
        local_ip VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        browser VARCHAR(100) NULL,
        os VARCHAR(100) NULL,
        device_type VARCHAR(50) NULL,
        screen_resolution VARCHAR(50) NULL,
        language VARCHAR(50) NULL,
        timezone VARCHAR(100) NULL,
        country VARCHAR(100) NULL,
        region VARCHAR(100) NULL,
        city VARCHAR(100) NULL,
        isp VARCHAR(255) NULL,
        vpn_detected TINYINT(1) DEFAULT 0,
        proxy_detected TINYINT(1) DEFAULT 0,
        login_method VARCHAR(50) NULL,
        is_active TINYINT(1) DEFAULT 1,
        logout_reason VARCHAR(100) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_sessions_user_id (user_id),
        INDEX idx_user_sessions_login_time (login_time),
        INDEX idx_user_sessions_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ];
    for (const sql of activityTrackingMigrations) {
      try { await connection.query(sql); } catch (e) {
        if (!/Duplicate|exists|errno: 1826|Can't create|Can't DROP/.test(e.message)) console.warn('Activity tracking migration warning:', e.message);
      }
    }

    // Add system_settings if missing
    console.log('Checking system_settings...');
    const [settingsRows] = await connection.query('SELECT 1 FROM system_settings LIMIT 1');
    if (settingsRows.length === 0) {
      await connection.query(`
        INSERT INTO system_settings (setting_name, setting_value) VALUES
        ('max_login_attempts', '5'),
        ('lockout_duration_minutes', '30'),
        ('password_min_length', '8'),
        ('session_timeout_hours', '24'),
        ('appointment_reminder_hours', '24')
      `);
    }

    await connection.commit();
    console.log('Migrations completed successfully');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
