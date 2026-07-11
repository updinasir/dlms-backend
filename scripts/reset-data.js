const pool = require('../config/database');

const SYSTEM_TABLES = [
  'roles',
  'permissions',
  'role_permissions',
  'license_categories',
  'notification_templates',
  'system_settings'
];

const RESET_TABLES = [
  'ai_detection_logs',
  'appointments',
  'audit_logs',
  'documents',
  'drivers',
  'email_logs',
  'learner_permits',
  'license_renewals',
  'licenses',
  'login_history',
  'notification_preferences',
  'notifications',
  'payments',
  'practical_exams',
  'refresh_tokens',
  'reports',
  'scheduled_notifications',
  'theory_exams',
  'token_blacklist',
  'traffic_violations',
  'user_sessions',
  'vehicles'
];

(async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of RESET_TABLES) {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`  reset: ${table}`);
    }

    // Remove driver/test users but keep system accounts (admin, staff, examiner, cashier, police)
    const [result] = await connection.query(
      `DELETE FROM users WHERE role_id = 6 OR email LIKE '%@example.com%' OR email LIKE '%test%'`
    );
    console.log(`  removed ${result.affectedRows} driver/test users`);

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();

    console.log('\nData reset complete. System rules and configuration preserved.');
    process.exit(0);
  } catch (error) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.rollback();
    console.error('Reset failed:', error);
    process.exit(1);
  } finally {
    connection.release();
  }
})();
