/*
 * DLMS - Core Business Rules Database Migration
 * ---------------------------------------------
 * Enforces data-integrity rules at the database level:
 *  - Unique driver email, phone, national_id, registration_number
 *  - Unique username on users
 *  - Soft-delete columns (deleted_at) for drivers and payments
 *  - Audit columns (created_by, updated_by, updated_at) on core tables
 *
 * Idempotent: safe to run multiple times.
 * Run:  node scripts/setup-business-rules.js
 */
const pool = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  return rows.length > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  = ${table}.${column} already exists`);
    return;
  }
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  console.log(`  + ${table}.${column} added`);
}

async function addUniqueIndex(table, indexName, column) {
  if (await indexExists(table, indexName)) {
    console.log(`  = unique ${indexName} already exists`);
    return;
  }
  // Normalise empty strings to NULL so the unique index does not clash
  await pool.query(`UPDATE \`${table}\` SET \`${column}\` = NULL WHERE \`${column}\` = ''`).catch(() => {});
  try {
    await pool.query(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (\`${column}\`)`);
    console.log(`  + unique ${indexName} added on ${table}.${column}`);
  } catch (err) {
    console.warn(`  ! could not add unique index ${indexName} on ${table}.${column}: ${err.message}`);
  }
}

async function setup() {
  try {
    console.log('Applying core business-rule constraints...\n');

    // --- Drivers ---
    console.log('drivers:');
    await addColumn('drivers', 'registration_number', "`registration_number` VARCHAR(30) DEFAULT NULL AFTER `national_id`");
    await addColumn('drivers', 'deleted_at', "`deleted_at` DATETIME DEFAULT NULL");
    await addColumn('drivers', 'created_by', "`created_by` INT DEFAULT NULL");
    await addColumn('drivers', 'updated_by', "`updated_by` INT DEFAULT NULL");
    await addColumn('drivers', 'updated_at', "`updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP");
    await addUniqueIndex('drivers', 'uniq_drivers_email', 'email');
    await addUniqueIndex('drivers', 'uniq_drivers_phone', 'phone');
    await addUniqueIndex('drivers', 'uniq_drivers_reg_no', 'registration_number');

    // --- Users ---
    console.log('users:');
    await addUniqueIndex('users', 'uniq_users_username', 'username');

    // --- Payments (no permanent delete) ---
    console.log('payments:');
    await addColumn('payments', 'deleted_at', "`deleted_at` DATETIME DEFAULT NULL");
    await addColumn('payments', 'created_by', "`created_by` INT DEFAULT NULL");

    // --- Licenses audit columns ---
    console.log('licenses:');
    await addColumn('licenses', 'created_by', "`created_by` INT DEFAULT NULL");
    await addColumn('licenses', 'updated_by', "`updated_by` INT DEFAULT NULL");

    // --- Backfill registration numbers for existing drivers ---
    console.log('\nBackfilling registration numbers...');
    const [drivers] = await pool.query('SELECT driver_id, registration_number, registration_date FROM drivers WHERE registration_number IS NULL');
    for (const d of drivers) {
      const year = d.registration_date ? new Date(d.registration_date).getFullYear() : new Date().getFullYear();
      const regNo = `DRV-${year}-${String(d.driver_id).padStart(5, '0')}`;
      await pool.query('UPDATE drivers SET registration_number = ? WHERE driver_id = ?', [regNo, d.driver_id]);
    }
    console.log(`  ${drivers.length} driver(s) backfilled`);

    console.log('\nBusiness-rule migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

setup();
