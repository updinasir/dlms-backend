const pool = require('../config/database');

async function main() {
  const [roles] = await pool.query('SELECT * FROM roles ORDER BY role_id');
  for (const r of roles) {
    const [perms] = await pool.query(
      'SELECT p.module, p.action, p.label FROM permissions p JOIN role_permissions rp ON p.permission_id=rp.permission_id WHERE rp.role_id=? ORDER BY p.module, p.action',
      [r.role_id]
    );
    console.log('\n=== ' + r.role_name + ' (' + r.role_id + ') - ' + perms.length + ' permissions ===');
    perms.forEach(p => console.log('  ' + p.module + '.' + p.action + ': ' + p.label));
  }
  process.exit(0);
}
main();
