const pool = require('../config/database');

const TABLES = process.argv[2] ? [process.argv[2]] : ['users'];

(async () => {
  try {
    for (const table of TABLES) {
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      console.log(`\n=== ${table} ===`);
      cols.forEach(c => console.log(`${c.Field} | ${c.Type} | null=${c.Null} | key=${c.Key} | default=${c.Default}`));
      const [idx] = await pool.query(`SHOW INDEX FROM \`${table}\``);
      const uniques = idx.filter(i => i.Non_unique === 0).map(i => `${i.Key_name}(${i.Column_name})`);
      console.log('UNIQUE indexes:', [...new Set(uniques)].join(', '));
    }
    process.exit(0);
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
})();
