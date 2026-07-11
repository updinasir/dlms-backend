const pool = require('../config/database');

(async () => {
  try {
    const [users] = await pool.query(`
      SELECT u.user_id, u.username, u.email, u.full_name, r.role_name 
      FROM users u 
      JOIN roles r ON u.role_id = r.role_id 
      ORDER BY r.role_id, u.user_id
    `);
    
    console.log('=== DLMS User Accounts ===');
    console.log('Password for all seeded users: Password123!');
    console.log('');
    
    users.forEach(u => {
      console.log(`Role: ${u.role_name.padEnd(15)} | Email: ${(u.email || 'N/A').padEnd(35)} | Name: ${u.full_name}`);
    });
    
    process.exit(0);
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
})();
