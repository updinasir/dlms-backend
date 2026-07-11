const pool = require('./config/database');

async function fixUser() {
  try {
    await pool.query("UPDATE users SET status = 'active' WHERE email = 'admin@dlms.com'");
    console.log('User admin@dlms.com activated successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixUser();
