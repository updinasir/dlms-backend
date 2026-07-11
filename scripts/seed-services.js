const pool = require('../config/database');

const defaultServices = [
  {
    service_code: 'REG',
    service_name: 'New Driver Registration',
    description: 'Registration fee for new driver application',
    official_price: 50.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'THEORY',
    service_name: 'Theory Examination',
    description: 'Fee for theory driving test',
    official_price: 30.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'PRACTICAL',
    service_name: 'Practical Examination',
    description: 'Fee for practical driving test',
    official_price: 50.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'LEARNER',
    service_name: 'Learner Permit',
    description: 'Fee for learner driving permit',
    official_price: 40.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'LICENSE',
    service_name: 'New Driving License',
    description: 'Fee for new driving license issuance',
    official_price: 60.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'RENEWAL',
    service_name: 'License Renewal',
    description: 'Fee for driving license renewal',
    official_price: 30.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'REPLACE',
    service_name: 'License Replacement',
    description: 'Fee for replacing lost or damaged license',
    official_price: 25.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'UPGRADE',
    service_name: 'License Upgrade',
    description: 'Fee for upgrading to higher license category',
    official_price: 45.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'DUPLICATE',
    service_name: 'Duplicate License',
    description: 'Fee for duplicate license copy',
    official_price: 20.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  },
  {
    service_code: 'CERTIFICATE',
    service_name: 'Driving Record Certificate',
    description: 'Fee for official driving record certificate',
    official_price: 15.00,
    currency: 'USD',
    status: 'Active',
    effective_date: new Date().toISOString().split('T')[0]
  }
];

async function seedServices() {
  try {
    console.log('Starting service seeding...');

    // Get super admin user ID for created_by
    const [adminUsers] = await pool.query(
      'SELECT user_id FROM users WHERE role_id = 1 LIMIT 1'
    );
    const adminId = adminUsers.length > 0 ? adminUsers[0].user_id : 1;

    for (const service of defaultServices) {
      // Check if service already exists
      const [existing] = await pool.query(
        'SELECT service_id FROM services WHERE service_code = ?',
        [service.service_code]
      );

      if (existing.length > 0) {
        console.log(`Service ${service.service_code} already exists, skipping...`);
        continue;
      }

      // Insert service
      await pool.query(
        'INSERT INTO services (service_code, service_name, description, official_price, currency, status, effective_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          service.service_code,
          service.service_name,
          service.description,
          service.official_price,
          service.currency,
          service.status,
          service.effective_date,
          adminId
        ]
      );

      console.log(`✓ Created service: ${service.service_name} ($${service.official_price})`);
    }

    console.log('\nService seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding services:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seedServices();
