const pool = require('./config/database');

async function check() {
  const tables = ['drivers','licenses','practical_exams','theory_exams','payments','appointments','users'];
  for (const t of tables) {
    try {
      const [r] = await pool.query('SELECT COUNT(*) as c FROM ' + t);
      console.log(t + ': ' + r[0].c);
    } catch(e) {
      console.log(t + ': ERROR - ' + e.message);
    }
  }
  process.exit(0);
}
check();
