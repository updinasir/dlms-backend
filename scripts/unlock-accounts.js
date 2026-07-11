const pool = require('../config/database');

(async () => {
  try {
    await pool.query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE lockout_until IS NOT NULL OR failed_login_attempts >= 5');
    const [rows] = await pool.query('SELECT email, failed_login_attempts, lockout_until FROM users WHERE failed_login_attempts > 0 OR lockout_until IS NOT NULL');
    console.log('Remaining locked accounts:', rows);
    console.log('All locked accounts have been unlocked.');
    process.exit(0);
  } catch (error) {
    console.error('Unlock failed:', error);
    process.exit(1);
  }
})();
