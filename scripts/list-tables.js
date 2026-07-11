const pool = require('../config/database');

(async () => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    console.log(rows.map(r => Object.values(r)[0]).join('\n'));
    process.exit(0);
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
})();
