const pool = require('./config/database');

async function seed() {
  try {
    // Get admin user ID
    const [users] = await pool.query('SELECT user_id FROM users WHERE email = ?', ['admin@dlms.com']);
    const adminId = users[0]?.user_id || 1;

    // Insert sample drivers
    const drivers = [
      { national_id: 'NID-100001', first_name: 'John', last_name: 'Doe', gender: 'Male', date_of_birth: '1985-03-15', phone: '+252-61-555-0101', email: 'john.doe@email.com', address: '123 Main Road, Hodan District', city: 'Mogadishu', blood_group: 'O+', emergency_contact: '+252-61-555-0199' },
      { national_id: 'NID-100002', first_name: 'Amina', last_name: 'Hassan', gender: 'Female', date_of_birth: '1990-07-22', phone: '+252-61-555-0102', email: 'amina.hassan@email.com', address: '45 Market Street, Waberi', city: 'Mogadishu', blood_group: 'A+', emergency_contact: '+252-61-555-0198' },
      { national_id: 'NID-100003', first_name: 'Mohamed', last_name: 'Ibrahim', gender: 'Male', date_of_birth: '1988-11-05', phone: '+252-61-555-0103', email: 'mohamed.i@email.com', address: '78 Airport Road, Darussalam', city: 'Mogadishu', blood_group: 'B+', emergency_contact: '+252-61-555-0197' },
      { national_id: 'NID-100004', first_name: 'Fatima', last_name: 'Omar', gender: 'Female', date_of_birth: '1992-01-18', phone: '+252-61-555-0104', email: 'fatima.o@email.com', address: '12 Beach Road, Hamarweyne', city: 'Mogadishu', blood_group: 'AB+', emergency_contact: '+252-61-555-0196' },
      { national_id: 'NID-100005', first_name: 'Abdullah', last_name: 'Ali', gender: 'Male', date_of_birth: '1983-09-30', phone: '+252-61-555-0105', email: 'abdullah.a@email.com', address: '33 Juba Avenue, Bondhere', city: 'Mogadishu', blood_group: 'O-', emergency_contact: '+252-61-555-0195' },
      { national_id: 'NID-100006', first_name: 'Hawa', last_name: 'Mohamed', gender: 'Female', date_of_birth: '1995-05-12', phone: '+252-61-555-0106', email: 'hawa.m@email.com', address: '67 KM4 Junction, Wadajir', city: 'Mogadishu', blood_group: 'A-', emergency_contact: '+252-61-555-0194' },
      { national_id: 'NID-100007', first_name: 'Yusuf', last_name: 'Ahmed', gender: 'Male', date_of_birth: '1980-12-08', phone: '+252-61-555-0107', email: 'yusuf.a@email.com', address: '91 Bakara Market, Hodan', city: 'Mogadishu', blood_group: 'B-', emergency_contact: '+252-61-555-0193' },
      { national_id: 'NID-100008', first_name: 'Safia', last_name: 'Noor', gender: 'Female', date_of_birth: '1993-08-25', phone: '+252-61-555-0108', email: 'safia.n@email.com', address: '55 University Road, Hamar Jajab', city: 'Mogadishu', blood_group: 'O+', emergency_contact: '+252-61-555-0192' }
    ];

    for (const d of drivers) {
      await pool.query(
        'INSERT INTO drivers (national_id, first_name, last_name, gender, date_of_birth, phone, email, address, city, blood_group, emergency_contact, registration_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)',
        [d.national_id, d.first_name, d.last_name, d.gender, d.date_of_birth, d.phone, d.email, d.address, d.city, d.blood_group, d.emergency_contact, 'Approved']
      );
    }
    console.log('✓ Inserted 8 drivers');

    // Get driver IDs
    const [driverRows] = await pool.query('SELECT driver_id FROM drivers ORDER BY driver_id');
    const driverIds = driverRows.map(r => r.driver_id);

    // Insert licenses
    const licenseCategories = [1, 2, 3, 2, 1, 3, 2, 1];
    const now = new Date();
    for (let i = 0; i < driverIds.length; i++) {
      const issueDate = new Date(now);
      issueDate.setMonth(issueDate.getMonth() - (i % 12));
      const expiryDate = new Date(issueDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + 5);
      const statuses = ['Active', 'Active', 'Active', 'Suspended', 'Active', 'Expired', 'Active', 'Active'];

      await pool.query(
        'INSERT INTO licenses (driver_id, category_id, license_number, issue_date, expiry_date, license_status) VALUES (?, ?, ?, ?, ?, ?)',
        [driverIds[i], licenseCategories[i], 'SL-' + (100000 + i), issueDate, expiryDate, statuses[i]]
      );
    }
    console.log('✓ Inserted 8 licenses');

    // Insert practical exams
    const vehicles = ['Toyota Corolla', 'Hilux Pickup', 'Mitsubishi Lancer', 'Nissan Patrol'];
    for (let i = 0; i < 12; i++) {
      const examDate = new Date(now);
      examDate.setDate(examDate.getDate() - (i * 7) + 14);
      const score = 65 + (i * 3);
      const result = score >= 70 ? 'Pass' : 'Fail';

      await pool.query(
        'INSERT INTO practical_exams (driver_id, examiner_id, exam_date, vehicle_used, score, result, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [driverIds[i % driverIds.length], adminId, examDate, vehicles[i % 4], score, result, 'Exam conducted at Mogadishu Testing Center']
      );
    }
    console.log('✓ Inserted 12 practical exams');

    // Insert theory exams
    for (let i = 0; i < 10; i++) {
      const examDate = new Date(now);
      examDate.setDate(examDate.getDate() - (i * 5) + 10);
      const score = 55 + (i * 4);
      const totalMarks = 100;
      const result = score >= 60 ? 'Pass' : 'Fail';

      await pool.query(
        'INSERT INTO theory_exams (driver_id, exam_date, score, total_marks, result, remarks) VALUES (?, ?, ?, ?, ?, ?)',
        [driverIds[i % driverIds.length], examDate, score, totalMarks, result, 'Theory exam conducted online']
      );
    }
    console.log('✓ Inserted 10 theory exams');

    // Insert payments
    const paymentTypes = ['Registration', 'Test', 'License', 'Renewal', 'Fine'];
    const paymentMethods = ['Cash', 'EVC Plus', 'Zaad', 'Sahal', 'Card'];
    for (let i = 0; i < 15; i++) {
      const paymentDate = new Date(now);
      paymentDate.setDate(paymentDate.getDate() - (i * 3));
      const amount = [50, 75, 100, 150, 200, 250, 300][i % 7];
      const status = i % 5 === 0 ? 'Pending' : 'Completed';

      await pool.query(
        'INSERT INTO payments (driver_id, payment_type, amount, payment_method, transaction_reference, payment_date, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [driverIds[i % driverIds.length], paymentTypes[i % 5], amount, paymentMethods[i % 5], 'TXN-' + (100000 + i), paymentDate, status]
      );
    }
    console.log('✓ Inserted 15 payments');

    // Insert appointments
    const appointmentTypes = ['Theory Test', 'Practical Test', 'License Collection', 'Renewal'];
    const centers = ['Mogadishu DMV Main', 'Hodan Branch Office', 'Waberi Testing Center', 'Darussalam Office'];
    for (let i = 0; i < 10; i++) {
      const appointmentDate = new Date(now);
      appointmentDate.setDate(appointmentDate.getDate() + (i * 2) - 5);
      const statuses = ['Completed', 'Completed', 'Completed', 'Pending', 'Approved', 'Approved', 'Approved', 'Cancelled', 'Pending', 'Approved'];

      await pool.query(
        'INSERT INTO appointments (driver_id, appointment_type, appointment_date, center_name, status) VALUES (?, ?, ?, ?, ?)',
        [driverIds[i % driverIds.length], appointmentTypes[i % 4], appointmentDate, centers[i % 4], statuses[i]]
      );
    }
    console.log('✓ Inserted 10 appointments');

    console.log('\n✅ Database seeded successfully with real data!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
