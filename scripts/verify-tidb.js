const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE || 'dlms',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });

  const [tables] = await conn.query('SHOW TABLES');
  console.log(`Tables: ${tables.length}`);

  const [[{ users }]] = await conn.query('SELECT COUNT(*) AS users FROM users');
  const [[{ drivers }]] = await conn.query('SELECT COUNT(*) AS drivers FROM drivers');
  const [[{ roles }]] = await conn.query('SELECT COUNT(*) AS roles FROM roles');
  console.log(`users=${users}, drivers=${drivers}, roles=${roles}`);

  await conn.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
