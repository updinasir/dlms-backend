const pool = require('../config/database');

const TABLES_TO_VERIFY = [
  'users',
  'drivers',
  'licenses',
  'theory_exams',
  'practical_exams',
  'appointments',
  'payments',
  'documents',
  'notifications'
];

(async () => {
  try {
    console.log('Verifying seeded data...\n');
    
    for (const table of TABLES_TO_VERIFY) {
      const [result] = await pool.query(`SELECT COUNT(*) as count FROM \`${table}\``);
      console.log(`${table.padEnd(20)}: ${result[0].count} records`);
    }

    // Verify role distribution
    console.log('\n--- User Role Distribution ---');
    const [roles] = await pool.query(`
      SELECT r.role_name, COUNT(u.user_id) as count 
      FROM users u 
      JOIN roles r ON u.role_id = r.role_id 
      GROUP BY r.role_id, r.role_name
      ORDER BY r.role_id
    `);
    roles.forEach(row => {
      console.log(`${row.role_name.padEnd(15)}: ${row.count} users`);
    });

    // Verify license status distribution
    console.log('\n--- License Status Distribution ---');
    const [licenseStatuses] = await pool.query(`
      SELECT license_status, COUNT(*) as count 
      FROM licenses 
      GROUP BY license_status
    `);
    licenseStatuses.forEach(row => {
      console.log(`${row.license_status.padEnd(15)}: ${row.count} licenses`);
    });

    // Verify exam results
    console.log('\n--- Exam Results ---');
    const [theoryResults] = await pool.query(`
      SELECT result, COUNT(*) as count 
      FROM theory_exams 
      GROUP BY result
    `);
    theoryResults.forEach(row => {
      console.log(`Theory ${row.result.padEnd(10)}: ${row.count} exams`);
    });
    const [practicalResults] = await pool.query(`
      SELECT result, COUNT(*) as count 
      FROM practical_exams 
      GROUP BY result
    `);
    practicalResults.forEach(row => {
      console.log(`Practical ${row.result.padEnd(7)}: ${row.count} exams`);
    });

    // Verify appointment statuses
    console.log('\n--- Appointment Status Distribution ---');
    const [appointmentStatuses] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM appointments 
      GROUP BY status
    `);
    appointmentStatuses.forEach(row => {
      console.log(`${row.status.padEnd(15)}: ${row.count} appointments`);
    });

    // Verify payment statuses
    console.log('\n--- Payment Status Distribution ---');
    const [paymentStatuses] = await pool.query(`
      SELECT payment_status, COUNT(*) as count 
      FROM payments 
      GROUP BY payment_status
    `);
    paymentStatuses.forEach(row => {
      console.log(`${row.payment_status.padEnd(15)}: ${row.count} payments`);
    });

    console.log('\n✓ Verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
})();
