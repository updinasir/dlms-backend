/**
 * Phase 5 migration: reminder and retry infrastructure.
 *
 * - appointments.reminder_24h_sent, reminder_1h_sent, reminder_15min_sent
 * - licenses.expiry_reminder_sent
 * - email_logs.attempts tracking already exists; add resent_at for resend audit
 *
 * Idempotent: safe to run multiple times.
 *
 * Run: node scripts/setup-reminders.js
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
  console.log('Starting reminder infrastructure migration...');

  await addColumn(
    'appointments',
    'reminder_24h_sent',
    'ADD COLUMN reminder_24h_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER preferred_date'
  );
  await addColumn(
    'appointments',
    'reminder_1h_sent',
    'ADD COLUMN reminder_1h_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER reminder_24h_sent'
  );
  await addColumn(
    'appointments',
    'reminder_15min_sent',
    'ADD COLUMN reminder_15min_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER reminder_1h_sent'
  );

  await addColumn(
    'licenses',
    'expiry_reminder_sent',
    'ADD COLUMN expiry_reminder_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER license_status'
  );

  await addColumn(
    'email_logs',
    'resent_at',
    'ADD COLUMN resent_at DATETIME NULL AFTER sent_at'
  );

  console.log('Reminder infrastructure migration complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
