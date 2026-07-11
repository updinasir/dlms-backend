const pool = require('./config/database');
async function check() {
  const [cols] = await pool.query('SHOW COLUMNS FROM appointments');
  cols.forEach(c => console.log(c.Field + ' | ' + c.Type));
  process.exit(0);
}
check();
