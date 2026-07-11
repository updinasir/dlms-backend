/**
 * Phase 4 migration: add biometrics and password policy columns.
 * - drivers.signature (varchar 255) for uploaded signature image
 * - users.must_change_password (tinyint 1) to force first-login password change
 *
 * Idempotent: safe to run multiple times.
 *
 * Run: node scripts/setup-biometrics-and-password-policy.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require(path.join(__dirname, '..', 'config', 'database'));

const COLUMNS = [
  { table: 'drivers', name: 'signature', ddl: "ADD COLUMN signature varchar(255) NULL AFTER fingerprint_data" }
];

async function addMustChangePassword() {
  const table = 'users';
  const name = 'must_change_password';
  if (await columnExists(table, name)) {
    console.log(`• ${table}.${name} already exists, skipping`);
    return;
  }
  // Some environments may not have password_changed_at yet; fall back to after password.
  const afterCol = (await columnExists(table, 'password_changed_at')) ? 'password_changed_at' : 'password';
  try {
    await pool.query(`ALTER TABLE ?? ADD COLUMN must_change_password tinyint(1) NOT NULL DEFAULT 0 AFTER ??`, [table, afterCol]);
    console.log(`✓ Added ${table}.${name} after ${afterCol}`);
  } catch (err) {
    console.error(`✗ Failed to add ${table}.${name}:`, err.message);
  }
}

async function columnExists(table, name) {
  const [rows] = await pool.query('SHOW COLUMNS FROM ?? LIKE ?', [table, name]);
  return rows.length > 0;
}

async function run() {
  console.log('Starting biometrics and password policy migration...');

  try {
    for (const col of COLUMNS) {
      try {
        if (await columnExists(col.table, col.name)) {
          console.log(`• ${col.table}.${col.name} already exists, skipping`);
          continue;
        }
        await pool.query(`ALTER TABLE ?? ${col.ddl}`, [col.table]);
        console.log(`✓ Added ${col.table}.${col.name}`);
      } catch (err) {
        console.error(`✗ Failed to add ${col.table}.${col.name}:`, err.message);
      }
    }

    await addMustChangePassword();

    console.log('Biometrics and password policy migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
