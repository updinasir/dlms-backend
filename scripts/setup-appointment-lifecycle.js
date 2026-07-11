/**
 * Phase 1 migration: extend the appointments table to support the full
 * government-style appointment lifecycle.
 *
 * - Expands the `status` ENUM to include check-in / waiting / in-progress /
 *   rescheduled / no-show / expired states.
 * - Adds examiner assignment, room, lifecycle timestamps and reschedule-request
 *   columns.
 *
 * Idempotent: safe to run multiple times.
 *
 * Run: node scripts/setup-appointment-lifecycle.js
 */
const pool = require('../config/database');

const NEW_STATUS_ENUM =
  "ENUM('Pending','Approved','Checked In','Waiting','In Progress','Completed','Cancelled','Rescheduled','No Show','Expired')";

const COLUMNS = [
  { name: 'examiner_id', ddl: 'ADD COLUMN examiner_id INT NULL AFTER center_name' },
  { name: 'room', ddl: 'ADD COLUMN room VARCHAR(100) NULL AFTER examiner_id' },
  { name: 'checked_in_at', ddl: 'ADD COLUMN checked_in_at DATETIME NULL AFTER status' },
  { name: 'started_at', ddl: 'ADD COLUMN started_at DATETIME NULL AFTER checked_in_at' },
  { name: 'completed_at', ddl: 'ADD COLUMN completed_at DATETIME NULL AFTER started_at' },
  { name: 'reschedule_requested', ddl: 'ADD COLUMN reschedule_requested TINYINT(1) NOT NULL DEFAULT 0 AFTER completed_at' },
  { name: 'reschedule_reason', ddl: 'ADD COLUMN reschedule_reason TEXT NULL AFTER reschedule_requested' },
  { name: 'preferred_date', ddl: 'ADD COLUMN preferred_date DATETIME NULL AFTER reschedule_reason' },
  { name: 'created_at', ddl: 'ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER preferred_date' }
];

async function columnExists(name) {
  const [rows] = await pool.query('SHOW COLUMNS FROM appointments LIKE ?', [name]);
  return rows.length > 0;
}

async function run() {
  console.log('Starting appointment lifecycle migration...');

  // 1. Expand the status ENUM
  try {
    await pool.query(`ALTER TABLE appointments MODIFY COLUMN status ${NEW_STATUS_ENUM} NOT NULL DEFAULT 'Pending'`);
    console.log('✓ status ENUM expanded');
  } catch (err) {
    console.error('✗ Failed to expand status ENUM:', err.message);
  }

  // 2. Add missing columns
  for (const col of COLUMNS) {
    try {
      if (await columnExists(col.name)) {
        console.log(`• ${col.name} already exists, skipping`);
        continue;
      }
      await pool.query(`ALTER TABLE appointments ${col.ddl}`);
      console.log(`✓ Added column ${col.name}`);
    } catch (err) {
      console.error(`✗ Failed to add column ${col.name}:`, err.message);
    }
  }

  console.log('Appointment lifecycle migration complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
