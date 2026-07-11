const pool = require('./config/database');

async function fixStatus() {
  try {
    await pool.query("UPDATE users SET status = 'active' WHERE email = 'admin@dlms.com'");
    console.log('Status updated to lowercase "active"');
    
    const [rows] = await pool.query("SELECT * FROM users WHERE email = 'admin@dlms.com'");
    console.log('Updated user:', rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixStatus();
