const pool = require('./config/database');

async function checkUser() {
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = 'admin@dlms.com'");
    console.log('User found:', rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUser();
