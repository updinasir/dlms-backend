const pool = require('./config/database');

async function checkTables() {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    console.log('Tables:', tables.map(t => Object.values(t)[0]));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkTables();
