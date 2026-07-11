const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const ROLES = {
  SUPER_ADMIN: 1,
  ADMIN: 2,
  EXAMINER: 3,
  STAFF: 4,
  CASHIER: 5,
  DRIVER: 6
};

const USERS = [
  // 10 Super Admins
  { email: 'superadmin@dlms.gov', full_name: 'System Administrator', role_id: ROLES.SUPER_ADMIN, username: 'superadmin' },
  { email: 'superadmin2@dlms.gov', full_name: 'Chief Technology Officer', role_id: ROLES.SUPER_ADMIN, username: 'superadmin2' },
  { email: 'superadmin3@dlms.gov', full_name: 'Chief Operations Officer', role_id: ROLES.SUPER_ADMIN, username: 'superadmin3' },
  { email: 'superadmin4@dlms.gov', full_name: 'Chief Security Officer', role_id: ROLES.SUPER_ADMIN, username: 'superadmin4' },
  { email: 'superadmin5@dlms.gov', full_name: 'System Architect', role_id: ROLES.SUPER_ADMIN, username: 'superadmin5' },
  { email: 'superadmin6@dlms.gov', full_name: 'Database Administrator', role_id: ROLES.SUPER_ADMIN, username: 'superadmin6' },
  { email: 'superadmin7@dlms.gov', full_name: 'Network Administrator', role_id: ROLES.SUPER_ADMIN, username: 'superadmin7' },
  { email: 'superadmin8@dlms.gov', full_name: 'Security Analyst', role_id: ROLES.SUPER_ADMIN, username: 'superadmin8' },
  { email: 'superadmin9@dlms.gov', full_name: 'Compliance Officer', role_id: ROLES.SUPER_ADMIN, username: 'superadmin9' },
  { email: 'superadmin10@dlms.gov', full_name: 'Audit Manager', role_id: ROLES.SUPER_ADMIN, username: 'superadmin10' },
  // 10 Admins
  { email: 'admin@dlms.gov', full_name: 'Operations Manager', role_id: ROLES.ADMIN, username: 'admin' },
  { email: 'admin2@dlms.gov', full_name: 'Regional Manager North', role_id: ROLES.ADMIN, username: 'admin2' },
  { email: 'admin3@dlms.gov', full_name: 'Regional Manager South', role_id: ROLES.ADMIN, username: 'admin3' },
  { email: 'admin4@dlms.gov', full_name: 'Regional Manager East', role_id: ROLES.ADMIN, username: 'admin4' },
  { email: 'admin5@dlms.gov', full_name: 'Regional Manager West', role_id: ROLES.ADMIN, username: 'admin5' },
  { email: 'admin6@dlms.gov', full_name: 'Center Manager Main', role_id: ROLES.ADMIN, username: 'admin6' },
  { email: 'admin7@dlms.gov', full_name: 'Center Manager Branch A', role_id: ROLES.ADMIN, username: 'admin7' },
  { email: 'admin8@dlms.gov', full_name: 'Center Manager Branch B', role_id: ROLES.ADMIN, username: 'admin8' },
  { email: 'admin9@dlms.gov', full_name: 'HR Manager', role_id: ROLES.ADMIN, username: 'admin9' },
  { email: 'admin10@dlms.gov', full_name: 'Finance Manager', role_id: ROLES.ADMIN, username: 'admin10' },
  // 10 Examiners
  { email: 'examiner1@dlms.gov', full_name: 'Mohamed Hassan', role_id: ROLES.EXAMINER, username: 'examiner1' },
  { email: 'examiner2@dlms.gov', full_name: 'Amina Abdi', role_id: ROLES.EXAMINER, username: 'examiner2' },
  { email: 'examiner3@dlms.gov', full_name: 'Ibrahim Yusuf', role_id: ROLES.EXAMINER, username: 'examiner3' },
  { email: 'examiner4@dlms.gov', full_name: 'Khadija Omar', role_id: ROLES.EXAMINER, username: 'examiner4' },
  { email: 'examiner5@dlms.gov', full_name: 'Abdullahi Ali', role_id: ROLES.EXAMINER, username: 'examiner5' },
  { email: 'examiner6@dlms.gov', full_name: 'Fatima Hassan', role_id: ROLES.EXAMINER, username: 'examiner6' },
  { email: 'examiner7@dlms.gov', full_name: 'Omar Nur', role_id: ROLES.EXAMINER, username: 'examiner7' },
  { email: 'examiner8@dlms.gov', full_name: 'Aisha Ibrahim', role_id: ROLES.EXAMINER, username: 'examiner8' },
  { email: 'examiner9@dlms.gov', full_name: 'Yusuf Mohamed', role_id: ROLES.EXAMINER, username: 'examiner9' },
  { email: 'examiner10@dlms.gov', full_name: 'Layla Ahmed', role_id: ROLES.EXAMINER, username: 'examiner10' },
  // 10 Cashiers
  { email: 'cashier@dlms.gov', full_name: 'Fatima Yusuf', role_id: ROLES.CASHIER, username: 'cashier' },
  { email: 'cashier2@dlms.gov', full_name: 'Sara Ali', role_id: ROLES.CASHIER, username: 'cashier2' },
  { email: 'cashier3@dlms.gov', full_name: 'Hassan Omar', role_id: ROLES.CASHIER, username: 'cashier3' },
  { email: 'cashier4@dlms.gov', full_name: 'Nadia Hassan', role_id: ROLES.CASHIER, username: 'cashier4' },
  { email: 'cashier5@dlms.gov', full_name: 'Khalid Yusuf', role_id: ROLES.CASHIER, username: 'cashier5' },
  { email: 'cashier6@dlms.gov', full_name: 'Amina Ibrahim', role_id: ROLES.CASHIER, username: 'cashier6' },
  { email: 'cashier7@dlms.gov', full_name: 'Omar Abdi', role_id: ROLES.CASHIER, username: 'cashier7' },
  { email: 'cashier8@dlms.gov', full_name: 'Fatima Nur', role_id: ROLES.CASHIER, username: 'cashier8' },
  { email: 'cashier9@dlms.gov', full_name: 'Ahmed Hassan', role_id: ROLES.CASHIER, username: 'cashier9' },
  { email: 'cashier10@dlms.gov', full_name: 'Layla Ali', role_id: ROLES.CASHIER, username: 'cashier10' },
  // 10 Staff
  { email: 'staff@dlms.gov', full_name: 'Ahmed Omar', role_id: ROLES.STAFF, username: 'staff' },
  { email: 'staff2@dlms.gov', full_name: 'Mohamed Ali', role_id: ROLES.STAFF, username: 'staff2' },
  { email: 'staff3@dlms.gov', full_name: 'Amina Hassan', role_id: ROLES.STAFF, username: 'staff3' },
  { email: 'staff4@dlms.gov', full_name: 'Ibrahim Yusuf', role_id: ROLES.STAFF, username: 'staff4' },
  { email: 'staff5@dlms.gov', full_name: 'Khadija Omar', role_id: ROLES.STAFF, username: 'staff5' },
  { email: 'staff6@dlms.gov', full_name: 'Abdullahi Ali', role_id: ROLES.STAFF, username: 'staff6' },
  { email: 'staff7@dlms.gov', full_name: 'Fatima Hassan', role_id: ROLES.STAFF, username: 'staff7' },
  { email: 'staff8@dlms.gov', full_name: 'Omar Nur', role_id: ROLES.STAFF, username: 'staff8' },
  { email: 'staff9@dlms.gov', full_name: 'Aisha Ibrahim', role_id: ROLES.STAFF, username: 'staff9' },
  { email: 'staff10@dlms.gov', full_name: 'Yusuf Mohamed', role_id: ROLES.STAFF, username: 'staff10' },
  // 10 Driver portal accounts
  { email: 'sara.ahmed@email.com', full_name: 'Sara Ahmed', role_id: ROLES.DRIVER, username: 'driver1' },
  { email: 'omar.ali@email.com', full_name: 'Omar Ali', role_id: ROLES.DRIVER, username: 'driver2' },
  { email: 'amina.yusuf@email.com', full_name: 'Amina Yusuf', role_id: ROLES.DRIVER, username: 'driver3' },
  { email: 'hassan.nur@email.com', full_name: 'Hassan Nur', role_id: ROLES.DRIVER, username: 'driver4' },
  { email: 'layla.omar@email.com', full_name: 'Layla Omar', role_id: ROLES.DRIVER, username: 'driver5' },
  { email: 'khalid.ibrahim@email.com', full_name: 'Khalid Ibrahim', role_id: ROLES.DRIVER, username: 'driver6' },
  { email: 'nadia.hassan@email.com', full_name: 'Nadia Hassan', role_id: ROLES.DRIVER, username: 'driver7' },
  { email: 'yusuf.ahmed@email.com', full_name: 'Yusuf Ahmed', role_id: ROLES.DRIVER, username: 'driver8' },
  { email: 'fatima.abdi@email.com', full_name: 'Fatima Abdi', role_id: ROLES.DRIVER, username: 'driver9' },
  { email: 'ali.mohamed@email.com', full_name: 'Ali Mohamed', role_id: ROLES.DRIVER, username: 'driver10' },
];

const DRIVERS = [
  { national_id: '1001', first_name: 'Sara', last_name: 'Ahmed', email: 'sara.ahmed@email.com', phone: '25261700001', dob: '1995-03-15' },
  { national_id: '1002', first_name: 'Omar', last_name: 'Ali', email: 'omar.ali@email.com', phone: '25261700002', dob: '1992-07-22' },
  { national_id: '1003', first_name: 'Amina', last_name: 'Yusuf', email: 'amina.yusuf@email.com', phone: '25261700003', dob: '1998-11-08' },
  { national_id: '1004', first_name: 'Hassan', last_name: 'Nur', email: 'hassan.nur@email.com', phone: '25261700004', dob: '1990-05-30' },
  { national_id: '1005', first_name: 'Layla', last_name: 'Omar', email: 'layla.omar@email.com', phone: '25261700005', dob: '1996-09-12' },
  { national_id: '1006', first_name: 'Khalid', last_name: 'Ibrahim', email: 'khalid.ibrahim@email.com', phone: '25261700006', dob: '1993-01-25' },
  { national_id: '1007', first_name: 'Nadia', last_name: 'Hassan', email: 'nadia.hassan@email.com', phone: '25261700007', dob: '1997-04-18' },
  { national_id: '1008', first_name: 'Yusuf', last_name: 'Ahmed', email: 'yusuf.ahmed@email.com', phone: '25261700008', dob: '1991-08-14' },
  { national_id: '1009', first_name: 'Fatima', last_name: 'Abdi', email: 'fatima.abdi@email.com', phone: '25261700009', dob: '1994-12-03' },
  { national_id: '1010', first_name: 'Ali', last_name: 'Mohamed', email: 'ali.mohamed@email.com', phone: '25261700010', dob: '1999-02-28' },
];

const LICENSE_CATEGORIES = ['Class A', 'Class B', 'Class C', 'Class D', 'Motorcycle'];

const LICENSE_STATUSES = ['Active', 'Pending', 'Expired', 'Suspended', 'Revoked'];
const EXAM_RESULTS = ['Pass', 'Fail'];
const APPOINTMENT_TYPES = ['Theory Test', 'Practical Test', 'License Collection', 'Renewal'];
const APPOINTMENT_STATUSES = ['Pending', 'Approved', 'Completed', 'Cancelled', 'No Show'];
const PAYMENT_STATUSES = ['Completed', 'Pending', 'Failed'];

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function seed() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log('Seeding DLMS test data...\n');

    // === 1. Seed Users ===
    console.log('1. Seeding users...');
    const passwordHash = await hashPassword('Password123!');
    for (const user of USERS) {
      const [existing] = await connection.query('SELECT user_id FROM users WHERE email = ?', [user.email]);
      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO users (email, full_name, password, role_id, username, status, created_at) VALUES (?, ?, ?, ?, ?, 'Active', NOW())`,
          [user.email, user.full_name, passwordHash, user.role_id, user.username]
        );
        console.log(`  + User: ${user.full_name} (${user.email})`);
      }
    }

    // === 2. Seed Drivers ===
    console.log('\n2. Seeding drivers...');
    const driverIds = [];
    for (const driver of DRIVERS) {
      const [existing] = await connection.query('SELECT driver_id FROM drivers WHERE national_id = ?', [driver.national_id]);
      if (existing.length === 0) {
        const regYear = new Date().getFullYear();
        const [result] = await connection.query(
          `INSERT INTO drivers (national_id, first_name, last_name, email, phone, date_of_birth, registration_number, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved')`,
          [driver.national_id, driver.first_name, driver.last_name, driver.email, driver.phone, driver.dob, `DRV-${regYear}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`]
        );
        driverIds.push(result.insertId);
        console.log(`  + Driver: ${driver.first_name} ${driver.last_name} (ID: ${result.insertId})`);
      } else {
        driverIds.push(existing[0].driver_id);
      }
    }

    // === 3. Seed Licenses ===
    console.log('\n3. Seeding licenses...');
    const [categories] = await connection.query('SELECT category_id, category_name FROM license_categories');
    for (const driverId of driverIds) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const status = LICENSE_STATUSES[Math.floor(Math.random() * LICENSE_STATUSES.length)];
      const expiryDate = status === 'Active' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;
      const [existing] = await connection.query('SELECT license_id FROM licenses WHERE driver_id = ?', [driverId]);
      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO licenses (driver_id, license_number, category_id, license_status, issue_date, expiry_date, workflow_status) 
           VALUES (?, ?, ?, ?, CURDATE(), ?, 'Collected')`,
          [driverId, `LIC-${Date.now()}-${Math.floor(Math.random() * 1000)}`, category.category_id, status, expiryDate]
        );
        console.log(`  + License for driver ${driverId}: ${category.category_name} (${status})`);
      }
    }

    // === 4. Seed Exams (Theory & Practical) ===
    console.log('\n4. Seeding exams...');
    const [examiners] = await connection.query('SELECT user_id FROM users WHERE role_id = ?', [ROLES.EXAMINER]);
    for (const driverId of driverIds) {
      // Theory exam
      const theoryScore = Math.floor(Math.random() * 40) + 60; // 60-100
      const theoryResult = theoryScore >= 70 ? 'Pass' : 'Fail';
      await connection.query(
        `INSERT INTO theory_exams (driver_id, score, total_marks, result, exam_date) VALUES (?, ?, 100, ?, DATE_SUB(CURDATE(), INTERVAL FLOOR(RAND()*30) DAY))`,
        [driverId, theoryScore, theoryResult]
      );

      // Practical exam (only if theory passed)
      if (theoryResult === 'Pass') {
        const practicalScore = Math.floor(Math.random() * 30) + 70; // 70-100
        const practicalResult = practicalScore >= 75 ? 'Pass' : 'Fail';
        const examinerId = examiners.length > 0 ? examiners[Math.floor(Math.random() * examiners.length)].user_id : null;
        await connection.query(
          `INSERT INTO practical_exams (driver_id, examiner_id, score, result, exam_date, vehicle_used) VALUES (?, ?, ?, ?, DATE_SUB(CURDATE(), INTERVAL FLOOR(RAND()*20) DAY), 'Test Vehicle')`,
          [driverId, examinerId, practicalScore, practicalResult]
        );
        console.log(`  + Exams for driver ${driverId}: Theory ${theoryResult} (${theoryScore}), Practical ${practicalResult} (${practicalScore})`);
      } else {
        console.log(`  + Exams for driver ${driverId}: Theory ${theoryResult} (${theoryScore})`);
      }
    }

    // === 5. Seed Appointments ===
    console.log('\n5. Seeding appointments...');
    for (const driverId of driverIds) {
      const type = APPOINTMENT_TYPES[Math.floor(Math.random() * APPOINTMENT_TYPES.length)];
      const status = APPOINTMENT_STATUSES[Math.floor(Math.random() * APPOINTMENT_STATUSES.length)];
      const examinerId = examiners.length > 0 ? examiners[Math.floor(Math.random() * examiners.length)].user_id : null;
      const appointmentDate = new Date(Date.now() + Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
      await connection.query(
        `INSERT INTO appointments (driver_id, appointment_type, appointment_date, center_name, examiner_id, room, status) 
         VALUES (?, ?, ?, 'Main Center', ?, ?, ?)`,
        [driverId, type, appointmentDate, examinerId, `Room ${Math.floor(Math.random() * 5) + 1}`, status]
      );
      console.log(`  + Appointment for driver ${driverId}: ${type} on ${appointmentDate} (${status})`);
    }

    // === 6. Seed Payments ===
    console.log('\n6. Seeding payments...');
    const paymentTypes = ['Registration', 'Test', 'License', 'Renewal', 'Fine'];
    const paymentMethods = ['Cash', 'EVC Plus', 'Zaad', 'Sahal', 'Card'];
    for (const driverId of driverIds) {
      const amount = (Math.random() * 100 + 50).toFixed(2);
      const status = PAYMENT_STATUSES[Math.floor(Math.random() * PAYMENT_STATUSES.length)];
      const paymentType = paymentTypes[Math.floor(Math.random() * paymentTypes.length)];
      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      await connection.query(
        `INSERT INTO payments (driver_id, payment_type, amount, payment_method, payment_status, transaction_reference) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [driverId, paymentType, amount, paymentMethod, status, `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`]
      );
      console.log(`  + Payment for driver ${driverId}: $${amount} (${paymentType}, ${status})`);
    }

    // === 7. Seed Documents ===
    console.log('\n7. Seeding documents...');
    const docTypes = ['National ID', 'Passport', 'Medical Certificate', 'Photo'];
    for (const driverId of driverIds) {
      for (const docType of docTypes) {
        await connection.query(
          `INSERT INTO documents (driver_id, document_type, file_path) VALUES (?, ?, ?)`,
          [driverId, docType, `/uploads/docs/${driverId}_${docType.replace(/\s/g, '_')}.pdf`]
        );
      }
      console.log(`  + 4 documents for driver ${driverId}`);
    }

    // === 8. Seed Notifications ===
    console.log('\n8. Seeding notifications...');
    const notificationCategories = ['Information', 'Success', 'Warning', 'Error'];
    const notificationTypes = ['System', 'Email', 'SMS'];
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    for (const driverId of driverIds) {
      const category = notificationCategories[Math.floor(Math.random() * notificationCategories.length)];
      const notificationType = notificationTypes[Math.floor(Math.random() * notificationTypes.length)];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];
      await connection.query(
        `INSERT INTO notifications (driver_id, title, message, category, notification_type, priority, status) 
         VALUES (?, 'System Update', 'Your profile has been updated successfully.', ?, ?, ?, 'Sent')`,
        [driverId, category, notificationType, priority]
      );
    }
    console.log(`  + Notifications for all drivers`);

    await connection.commit();
    console.log('\n✓ Data seeding completed successfully!');
    console.log(`  - Users: ${USERS.length}`);
    console.log(`  - Drivers: ${DRIVERS.length}`);
    console.log(`  - Licenses: ${DRIVERS.length}`);
    console.log(`  - Exams: ${DRIVERS.length * 2}`);
    console.log(`  - Appointments: ${DRIVERS.length}`);
    console.log(`  - Payments: ${DRIVERS.length}`);
    console.log(`  - Documents: ${DRIVERS.length * 4}`);
    console.log(`  - Notifications: ${DRIVERS.length}`);
    process.exit(0);
  } catch (error) {
    await connection.rollback();
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    connection.release();
  }
}

seed();
