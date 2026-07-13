/*
 * One-time import: loads a mysqldump .sql file into a target MySQL/TiDB database.
 *
 * Usage (PowerShell):
 *   $env:TIDB_HOST="..."; $env:TIDB_PORT="4000"; $env:TIDB_USER="..."; \
 *   $env:TIDB_PASSWORD="..."; $env:TIDB_DATABASE="dlms"; \
 *   node scripts/import-to-tidb.js ./dlms_dump.sql
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const dumpPath = process.argv[2] || path.join(__dirname, '..', 'dlms_dump.sql');
  const host = process.env.TIDB_HOST;
  const port = Number(process.env.TIDB_PORT || 4000);
  const user = process.env.TIDB_USER;
  const password = process.env.TIDB_PASSWORD;
  const database = process.env.TIDB_DATABASE || 'dlms';

  if (!host || !user || password === undefined) {
    console.error('Missing TIDB_HOST / TIDB_USER / TIDB_PASSWORD environment variables.');
    process.exit(1);
  }

  if (!fs.existsSync(dumpPath)) {
    console.error(`Dump file not found: ${dumpPath}`);
    process.exit(1);
  }

  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };

  console.log(`Connecting to ${host}:${port} ...`);
  const admin = await mysql.createConnection({ host, port, user, password, ssl, multipleStatements: true });

  console.log(`Ensuring database \`${database}\` exists ...`);
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await admin.end();

  console.log(`Reading dump: ${dumpPath}`);
  const sql = fs.readFileSync(dumpPath, 'utf8');

  console.log(`Importing into \`${database}\` ...`);
  const conn = await mysql.createConnection({ host, port, user, password, database, ssl, multipleStatements: true });
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query(sql);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();

  console.log('Import complete.');
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
