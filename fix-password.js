const bcrypt = require('bcryptjs');
const pool = require('./config/database');

async function fixPassword() {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    await pool.query("UPDATE users SET password = ? WHERE email = 'admin@dlms.com'", [hashedPassword]);
    console.log('Password reset successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixPassword();
