const pool = require('./config/database');

async function checkRoles() {
  try {
    const [roles] = await pool.query('SELECT * FROM roles');
    console.log('Roles:', roles);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkRoles();
