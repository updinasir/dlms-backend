const bcrypt = require('bcryptjs');
const pool = require('./config/database');
require('dotenv').config();

async function main() {
  try {
    const email = process.argv[2];
    const password = process.argv[3];
    const fullName = process.argv[4] || 'Super Admin 2';

    if (!email || !password) {
      console.error('Usage: node create-super-admin.js <email> <password> [full_name]');
      process.exit(1);
    }

    // Check if user exists
    const [rows] = await pool.query('SELECT user_id, role_id, status FROM users WHERE email = ? LIMIT 1', [email]);

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (rows.length) {
      const userId = rows[0].user_id;
      await pool.query(
        "UPDATE users SET password = ?, role_id = 1, status = 'Active', password_changed_at = NOW(), failed_login_attempts = 0, lockout_until = NULL WHERE user_id = ?",
        [hashedPassword, userId]
      );
      console.log(`✓ Updated existing user ${email} to Super Admin and reset password.`);
    } else {
      const [result] = await pool.query(
        'INSERT INTO users (full_name, email, password, role_id, status, created_at, password_changed_at) VALUES (?, ?, ?, 1, \"Active\", NOW(), NOW())',
        [fullName, email, hashedPassword]
      );
      console.log(`✓ Created new Super Admin: ${email} (user_id=${result.insertId})`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error creating Super Admin:', err);
    process.exit(1);
  }
}

main();
