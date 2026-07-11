const pool = require('./config/database');

async function check() {
  const tables = ['drivers', 'licenses', 'practical_exams', 'theory_exams', 'payments'];
  for (const t of tables) {
    try {
      const [cols] = await pool.query('SHOW COLUMNS FROM ' + t);
      console.log('\n=== ' + t + ' ===');
      cols.forEach(c => {
        const extra = [];
        if (c.Null === 'NO') extra.push('NOT NULL');
        if (c.Key === 'PRI') extra.push('PRIMARY KEY');
        if (c.Key === 'UNI') extra.push('UNIQUE');
        if (c.Key === 'MUL') extra.push('INDEX');
        console.log('  ' + c.Field + ' | ' + c.Type + ' | ' + extra.join(', '));
      });
    } catch(e) {
      console.log(t + ': ERROR - ' + e.message);
    }
  }
  process.exit(0);
}
check();
