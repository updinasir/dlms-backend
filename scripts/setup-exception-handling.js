/**
 * Phase 6 migration: exception handling infrastructure.
 *
 * - appointments.late_at DATETIME
 *
 * Idempotent: safe to run multiple times.
 *
 * Run: node scripts/setup-exception-handling.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require(path.join(__dirname, '..', 'config', 'database'));

async function columnExists(table, name) {
  const [rows] = await pool.query('SHOW COLUMNS FROM ?? LIKE ?', [table, name]);
  return rows.length > 0;
}

async function addColumn(table, name, ddl) {
  if (await columnExists(table, name)) {
    console.log(`• ${table}.${name} already exists, skipping`);
    return;
  }
  try {
    await pool.query(`ALTER TABLE ?? ${ddl}`, [table]);
    console.log(`✓ Added ${table}.${name}`);
  } catch (err) {
    console.error(`✗ Failed to add ${table}.${name}:`, err.message);
  }
}

async function run() {
  console.log('Starting exception handling migration...');

  await addColumn(
    'appointments',
    'late_at',
    'ADD COLUMN late_at DATETIME NULL AFTER reschedule_reason'
  );

  console.log('Exception handling migration complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
