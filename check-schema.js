const pool = require('./config/database');

async function check() {
  const tables = ['drivers', 'licenses', 'practical_exams', 'theory_exams', 'payments', 'appointments', 'users'];
  for (const t of tables) {
    try {
      const [cols] = await pool.query('SHOW COLUMNS FROM ' + t);
      console.log('\n=== ' + t + ' ===');
      cols.forEach(c => console.log('  ' + c.Field + ' (' + c.Type + ')' + (c.Null === 'NO' ? ' NOT NULL' : '') + (c.Key ? ' ' + c.Key : '')));
    } catch(e) {
      console.log(t + ': ERROR - ' + e.message);
    }
  }
  process.exit(0);
}
check();
