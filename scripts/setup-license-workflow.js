/**
 * Phase 3 migration: add license workflow_status column to track the government
 * processing pipeline (Pending Payment -> Approved -> Printed -> Ready for Collection -> Collected -> Active).
 *
 * Idempotent: safe to run multiple times.
 *
 * Run: node scripts/setup-license-workflow.js
 */
const pool = require('../config/database');

const WORKFLOW_ENUM =
  "ENUM('Pending Payment','Approved','Printed','Ready for Collection','Collected')";

const COLUMNS = [
  { name: 'workflow_status', ddl: `ADD COLUMN workflow_status ${WORKFLOW_ENUM} NOT NULL DEFAULT 'Pending Payment' AFTER license_status` },
  { name: 'payment_verified_at', ddl: 'ADD COLUMN payment_verified_at DATETIME NULL AFTER workflow_status' },
  { name: 'approved_at', ddl: 'ADD COLUMN approved_at DATETIME NULL AFTER payment_verified_at' },
  { name: 'printed_at', ddl: 'ADD COLUMN printed_at DATETIME NULL AFTER approved_at' },
  { name: 'collected_at', ddl: 'ADD COLUMN collected_at DATETIME NULL AFTER printed_at' },
  { name: 'printed_by', ddl: 'ADD COLUMN printed_by INT NULL AFTER collected_at' },
  { name: 'collected_by', ddl: 'ADD COLUMN collected_by INT NULL AFTER printed_by' }
];

async function columnExists(name) {
  const [rows] = await pool.query('SHOW COLUMNS FROM licenses LIKE ?', [name]);
  return rows.length > 0;
}

async function run() {
  console.log('Starting license workflow migration...');

  for (const col of COLUMNS) {
    try {
      if (await columnExists(col.name)) {
        console.log(`• ${col.name} already exists, skipping`);
        continue;
      }
      await pool.query(`ALTER TABLE licenses ${col.ddl}`);
      console.log(`✓ Added column ${col.name}`);
    } catch (err) {
      console.error(`✗ Failed to add column ${col.name}:`, err.message);
    }
  }

  // Backfill existing rows that predate the workflow (assume Active = Collected, others = Pending Payment)
  try {
    await pool.query("UPDATE licenses SET workflow_status = 'Collected' WHERE license_status = 'Active' AND workflow_status = 'Pending Payment'");
    await pool.query("UPDATE licenses SET workflow_status = 'Pending Payment' WHERE license_status IN ('Pending','Expired','Suspended','Revoked') AND workflow_status = 'Pending Payment'");
    console.log('✓ Backfilled workflow status');
  } catch (err) {
    console.error('✗ Failed to backfill workflow status:', err.message);
  }

  console.log('License workflow migration complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
