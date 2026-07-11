const pool = require('../config/database');

async function migrate() {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'profile_image'");
    if (cols.length > 0) {
      console.log('profile_image column already exists');
      process.exit(0);
    }
    await pool.query('ALTER TABLE users ADD COLUMN profile_image VARCHAR(500) NULL');
    console.log('profile_image column added successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    pool.end();
  }
}

migrate();
