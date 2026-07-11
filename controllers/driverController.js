const Driver = require('../models/Driver');
const pool = require('../config/database');
const path = require('path');
const bcrypt = require('bcryptjs');
const notificationService = require('../services/notificationService');
const { sendTemporaryPasswordEmail } = require('../utils/emailService');
const { isValidEmail, isValidPhone, calculateAge, isFutureDate } = require('../utils/security');

const MIN_DRIVING_AGE = 18;

const safeSend = (opts) => notificationService.send(opts).catch((e) => console.error('send error:', e.message));

// Generate a unique driver registration number: DRV-YYYY-NNNNN
const generateRegistrationNumber = async (connection) => {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const random = Math.floor(10000 + Math.random() * 90000);
    const candidate = `DRV-${year}-${random}`;
    const [rows] = await connection.query(
      'SELECT driver_id FROM drivers WHERE registration_number = ? LIMIT 1',
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }
  return `DRV-${year}-${Date.now().toString().slice(-6)}`;
};

// Generate a unique portal username from the driver's name
const generateUsername = async (connection, firstName, lastName) => {
  const base = `${(firstName || 'driver').toLowerCase()}.${(lastName || '').toLowerCase()}`
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '') || 'driver';
  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = attempt === 0 ? '' : String(Math.floor(100 + Math.random() * 900));
    const candidate = `${base}${suffix}`;
    const [rows] = await connection.query(
      'SELECT user_id FROM users WHERE username = ? LIMIT 1',
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }
  return `${base}${Date.now().toString().slice(-5)}`;
};

const resolvePhotoPath = (req) => {
  if (req.file) {
    const normalized = req.file.path.replace(/\\/g, '/');
    const uploadsIndex = normalized.lastIndexOf('/uploads/');
    return uploadsIndex >= 0 ? normalized.slice(uploadsIndex) : `/uploads/${path.basename(normalized)}`;
  }

  return req.body.photo || null;
};

const logDriverAudit = async (req, action, recordId, details) => {
  try {
    await pool.query('INSERT INTO audit_logs SET ?', {
      user_id: req.user?.id || null,
      action_performed: action,
      table_name: 'drivers',
      record_id: recordId,
      action_time: new Date()
    });
  } catch (error) {
    console.warn('Driver audit log skipped:', error.message);
  }
};

// Get all drivers
const getAllDrivers = async (req, res) => {
  try {
    const { search, status, license_type, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { search, status, license_type, limit, offset };
    const drivers = await Driver.findAll(filters);
    const total = await Driver.count(filters);

    res.json({
      drivers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get driver by ID
const getDriverById = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.json({ driver });
  } catch (error) {
    console.error('Get driver error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create driver
const createDriver = async (req, res) => {
  // --- Required field validation ---
  const missing = [];
  if (!req.body.national_id) missing.push('National ID');
  if (!req.body.first_name) missing.push('First name');
  if (!req.body.last_name) missing.push('Last name');
  if (!req.body.date_of_birth) missing.push('Date of birth');
  if (!req.body.gender) missing.push('Gender');
  if (!req.body.phone) missing.push('Phone number');
  if (missing.length > 0) {
    return res.status(400).json({ message: `Required fields missing: ${missing.join(', ')}` });
  }

  // --- Format validation ---
  if (req.body.email && !isValidEmail(req.body.email)) {
    return res.status(400).json({ message: 'Invalid email address format' });
  }
  if (!isValidPhone(req.body.phone)) {
    return res.status(400).json({ message: 'Invalid phone number format' });
  }

  // --- Date of birth / minimum driving age validation ---
  if (isFutureDate(req.body.date_of_birth)) {
    return res.status(400).json({ message: 'Date of birth cannot be in the future' });
  }
  const age = calculateAge(req.body.date_of_birth);
  if (age === null) {
    return res.status(400).json({ message: 'Invalid date of birth' });
  }
  if (age < MIN_DRIVING_AGE) {
    return res.status(400).json({ message: `Driver must be at least ${MIN_DRIVING_AGE} years old to register` });
  }

  // --- Uniqueness validation before starting a transaction ---
  const [existingNationalId] = await pool.query(
    'SELECT driver_id FROM drivers WHERE national_id = ? AND deleted_at IS NULL LIMIT 1',
    [req.body.national_id]
  );
  if (existingNationalId.length > 0) {
    return res.status(409).json({ message: 'A driver with this National ID already exists' });
  }

  if (req.body.email) {
    const [existingEmail] = await pool.query(
      'SELECT driver_id FROM drivers WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [req.body.email]
    );
    if (existingEmail.length > 0) {
      return res.status(409).json({ message: 'A driver with this email already exists' });
    }
  }

  const [existingPhone] = await pool.query(
    'SELECT driver_id FROM drivers WHERE phone = ? AND deleted_at IS NULL LIMIT 1',
    [req.body.phone]
  );
  if (existingPhone.length > 0) {
    return res.status(409).json({ message: 'A driver with this phone number already exists' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const driverData = {
      national_id: req.body.national_id,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      gender: req.body.gender,
      date_of_birth: req.body.date_of_birth,
      phone: req.body.phone,
      email: req.body.email,
      address: req.body.address,
      city: req.body.city,
      blood_group: req.body.blood_group,
      emergency_contact: req.body.emergency_contact,
      photo: resolvePhotoPath(req),
      registration_number: await generateRegistrationNumber(connection),
      registration_date: new Date(),
      status: req.body.status || 'Pending',
      created_by: req.user?.id || null
    };

    const photoPath = resolvePhotoPath(req);
    if (photoPath) {
      driverData.photo = photoPath;
    }

    const [driverResult] = await connection.query('INSERT INTO drivers SET ?', driverData);
    const driverId = driverResult.insertId;

    // Auto-create portal account for the driver within the same transaction
    let tempPassword = null;
    let portalUsername = null;
    const driverEmail = driverData.email;
    if (driverEmail) {
      const [existing] = await connection.query('SELECT user_id FROM users WHERE email = ?', [driverEmail]);
      if (existing.length === 0) {
        tempPassword = '123';
        portalUsername = await generateUsername(connection, driverData.first_name, driverData.last_name);
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);
        await connection.query(
          'INSERT INTO users (username, full_name, email, phone, password, role_id, status, created_at, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            portalUsername,
            (driverData.first_name || '') + ' ' + (driverData.last_name || ''),
            driverEmail,
            driverData.phone || null,
            hashedPassword,
            6,
            'Active',
            new Date(),
            1
          ]
        );
      }
    }

    await connection.commit();

    // Send temporary password email outside the transaction (best effort)
    if (tempPassword && driverEmail) {
      try {
        const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
        const emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10B981;">Driver Portal Account Created</h2>
            <p>Dear ${driverData.first_name || ''} ${driverData.last_name || ''},</p>
            <p>Your driver portal account has been created. Use the login information below to access the portal for the first time.</p>
            <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
            <p><strong>Username:</strong> ${driverEmail}</p>
            <p><strong>Password:</strong> <span style="font-family: monospace; background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${tempPassword}</span></p>
            <p>For security, you will be required to change this password the first time you log in.</p>
            <p>Best regards,<br>DLMS11 Team</p>
          </div>
        `;

        await pool.query(
          `INSERT INTO email_logs (recipient_email, subject, body, status, attempts, created_at)
           VALUES (?, ?, ?, 'Pending', 1, NOW())`,
          [driverEmail, 'Your DLMS11 Driver Portal Account', emailBody]
        );

        await sendTemporaryPasswordEmail(
          driverEmail,
          `${driverData.first_name || ''} ${driverData.last_name || ''}`.trim(),
          tempPassword,
          loginUrl
        );

        await pool.query(
          `UPDATE email_logs SET status = 'Sent', sent_at = NOW() WHERE recipient_email = ? AND subject = ? ORDER BY created_at DESC LIMIT 1`,
          [driverEmail, 'Your DLMS11 Driver Portal Account']
        );
      } catch (emailError) {
        console.warn('Temporary password email failed:', emailError.message);
        await pool.query(
          `UPDATE email_logs SET status = 'Failed', error_message = ? WHERE recipient_email = ? AND subject = ? ORDER BY created_at DESC LIMIT 1`,
          [String(emailError.message || emailError).slice(0, 500), driverEmail, 'Your DLMS11 Driver Portal Account']
        );
      }
    }

    const driver = await Driver.findById(driverId);

    // Log activity (outside transaction — best effort)
    await logDriverAudit(req, 'CREATE', driver.driver_id, { action: 'create_driver', driver_id: driver.driver_id });

    // Notifications (fire-and-forget): welcome the driver + alert admins
    const driverName = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
    safeSend({
      title: 'Welcome to DLMS',
      message: `Your driver profile has been created. A temporary portal password has been sent to ${driver.email || 'your email'}.`,
      category: 'Success',
      module: 'drivers',
      link: '/dashboard',
      target: { driverId: driver.driver_id },
      triggeredBy: req.user?.id || null
    });
    safeSend({
      title: 'New Driver Registered',
      message: `${driverName || 'A new driver'} has been registered.`,
      category: 'Information',
      module: 'drivers',
      link: `/dashboard/drivers/${driver.driver_id}`,
      target: { roles: ['super_admin', 'admin'] },
      triggeredBy: req.user?.id || null
    });

    res.status(201).json({
      message: 'Driver created successfully',
      driver
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create driver error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

// Update driver
const updateDriver = async (req, res) => {
  try {
    const updateData = {};

    const fields = [
      'national_id', 'first_name', 'last_name', 'gender', 'date_of_birth',
      'phone', 'email', 'address', 'city', 'blood_group', 'emergency_contact',
      'status'
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined && req.body[field] !== '') {
        updateData[field] = req.body[field];
      }
    });

    const photoPath = resolvePhotoPath(req);
    if (photoPath) {
      updateData.photo = photoPath;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No driver fields provided for update' });
    }

    // Format validation
    if (updateData.email && !isValidEmail(updateData.email)) {
      return res.status(400).json({ message: 'Invalid email address format' });
    }
    if (updateData.phone && !isValidPhone(updateData.phone)) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }

    // Date of birth / minimum driving age validation
    if (updateData.date_of_birth) {
      if (isFutureDate(updateData.date_of_birth)) {
        return res.status(400).json({ message: 'Date of birth cannot be in the future' });
      }
      const age = calculateAge(updateData.date_of_birth);
      if (age === null) {
        return res.status(400).json({ message: 'Invalid date of birth' });
      }
      if (age < MIN_DRIVING_AGE) {
        return res.status(400).json({ message: `Driver must be at least ${MIN_DRIVING_AGE} years old` });
      }
    }

    // Check for duplicate email if being updated
    if (updateData.email) {
      const [existingEmail] = await pool.query(
        'SELECT driver_id FROM drivers WHERE email = ? AND driver_id != ? AND deleted_at IS NULL LIMIT 1',
        [updateData.email, req.params.id]
      );
      if (existingEmail.length > 0) {
        return res.status(409).json({ message: 'Another driver already uses this email address' });
      }
    }

    // Check for duplicate phone if being updated
    if (updateData.phone) {
      const [existingPhone] = await pool.query(
        'SELECT driver_id FROM drivers WHERE phone = ? AND driver_id != ? AND deleted_at IS NULL LIMIT 1',
        [updateData.phone, req.params.id]
      );
      if (existingPhone.length > 0) {
        return res.status(409).json({ message: 'Another driver already uses this phone number' });
      }
    }

    // Check for duplicate national_id if being updated
    if (updateData.national_id) {
      const [existingId] = await pool.query(
        'SELECT driver_id FROM drivers WHERE national_id = ? AND driver_id != ? AND deleted_at IS NULL LIMIT 1',
        [updateData.national_id, req.params.id]
      );
      if (existingId.length > 0) {
        return res.status(409).json({ message: 'Another driver already uses this National ID' });
      }
    }

    updateData.updated_by = req.user?.id || null;

    const driver = await Driver.update(req.params.id, updateData);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Log activity
    await logDriverAudit(req, 'UPDATE', driver.driver_id, { action: 'update_driver', driver_id: driver.driver_id });

    res.json({
      message: 'Driver updated successfully',
      driver
    });
  } catch (error) {
    console.error('Update driver error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete driver
const deleteDriver = async (req, res) => {
  try {
    await Driver.delete(req.params.id);

    // Log activity
    await logDriverAudit(req, 'DELETE', req.params.id, { action: 'delete_driver', driver_id: req.params.id });

    res.json({ message: 'Driver deleted successfully' });
  } catch (error) {
    console.error('Delete driver error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Search drivers
const searchDrivers = async (req, res) => {
  try {
    const queryParam = req.params.query || req.query.query;
    if (!queryParam) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const exact = req.query.exact === 'true';
    const drivers = await Driver.findAll({ search: queryParam, exact, limit: exact ? 1 : undefined });

    res.json({ drivers });
  } catch (error) {
    console.error('Search drivers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Public driver verification (for QR code scans)
const verifyDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.json({
      verified: true,
      driver: {
        driver_id: driver.driver_id,
        full_name: `${driver.first_name || ''} ${driver.last_name || ''}`.trim(),
        national_id: driver.national_id,
        date_of_birth: driver.date_of_birth,
        gender: driver.gender,
        blood_group: driver.blood_group,
        status: driver.status,
        photo: driver.photo,
        city: driver.city,
        phone: driver.phone
      }
    });
  } catch (error) {
    console.error('Verify driver error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload driver signature image
const uploadSignature = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Signature image is required' });
    }

    const normalized = req.file.path.replace(/\\/g, '/');
    const uploadsIndex = normalized.lastIndexOf('/uploads/');
    const signaturePath = uploadsIndex >= 0 ? normalized.slice(uploadsIndex) : `/uploads/${path.basename(normalized)}`;

    const driver = await Driver.update(req.params.id, { signature: signaturePath });
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    await logDriverAudit(req, 'UPDATE', driver.driver_id, { action: 'upload_signature', driver_id: driver.driver_id });

    res.json({ message: 'Signature uploaded successfully', driver });
  } catch (error) {
    console.error('Upload signature error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload driver fingerprint data (base64/template)
const uploadFingerprint = async (req, res) => {
  try {
    const { fingerprint_data } = req.body;
    if (!fingerprint_data || typeof fingerprint_data !== 'string') {
      return res.status(400).json({ message: 'Fingerprint data is required' });
    }

    const driver = await Driver.update(req.params.id, { fingerprint_data });
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    await logDriverAudit(req, 'UPDATE', driver.driver_id, { action: 'upload_fingerprint', driver_id: driver.driver_id });

    res.json({ message: 'Fingerprint uploaded successfully', driver });
  } catch (error) {
    console.error('Upload fingerprint error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get driver statistics
const getDriverStatistics = async (req, res) => {
  try {
    const stats = await Driver.getStatistics();
    res.json({ statistics: stats });
  } catch (error) {
    console.error('Get driver statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Check for duplicate driver records
const checkDuplicate = async (req, res) => {
  try {
    const { national_id, email, phone } = req.query;
    
    if (!national_id && !email && !phone) {
      return res.status(400).json({ message: 'At least one field to check is required' });
    }

    const conditions = [];
    const params = [];

    if (national_id) {
      conditions.push('national_id = ?');
      params.push(national_id);
    }
    if (email) {
      conditions.push('email = ?');
      params.push(email);
    }
    if (phone) {
      conditions.push('phone = ?');
      params.push(phone);
    }

    const whereClause = conditions.join(' OR ');
    const query = `SELECT driver_id, national_id, email, phone FROM drivers WHERE deleted_at IS NULL AND (${whereClause}) LIMIT 1`;
    
    const [rows] = await pool.query(query, params);
    
    res.json({ exists: rows.length > 0 });
  } catch (error) {
    console.error('Check duplicate error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get driver exam status for license issuance
const getDriverExamStatus = async (req, res) => {
  try {
    const driverId = req.params.driverId;
    
    // Check if exams table exists
    const [tableCheck] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'exams'
    `);
    
    if (tableCheck[0].count === 0) {
      // Exams table doesn't exist, return default values
      return res.json({
        theory_passed: false,
        practical_passed: false,
        theory_total: 0,
        practical_total: 0
      });
    }
    
    // Check theory exam status
    const [theoryExams] = await pool.query(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN result = 'Pass' THEN 1 ELSE 0 END) as passed
      FROM exams 
      WHERE driver_id = ? AND exam_type = 'Theory' AND deleted_at IS NULL
    `, [driverId]);
    
    // Check practical exam status
    const [practicalExams] = await pool.query(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN result = 'Pass' THEN 1 ELSE 0 END) as passed
      FROM exams 
      WHERE driver_id = ? AND exam_type = 'Practical' AND deleted_at IS NULL
    `, [driverId]);
    
    const theory_passed = theoryExams[0].passed > 0;
    const practical_passed = practicalExams[0].passed > 0;
    
    res.json({
      theory_passed,
      practical_passed,
      theory_total: theoryExams[0].total,
      practical_total: practicalExams[0].total
    });
  } catch (error) {
    console.error('Get driver exam status error:', error);
    // Return default values on error
    res.json({
      theory_passed: false,
      practical_passed: false,
      theory_total: 0,
      practical_total: 0
    });
  }
};

// Update driver status
const updateDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Approved', 'Pending', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    await pool.query(
      'UPDATE drivers SET status = ?, updated_at = NOW() WHERE driver_id = ?',
      [status, id]
    );

    res.json({ message: 'Driver status updated successfully' });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Export drivers to CSV
const exportDrivers = async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = `
      SELECT d.driver_id, d.national_id, d.first_name, d.last_name, d.email, d.phone, 
             d.city, d.status, d.registration_date
      FROM drivers d
      WHERE d.deleted_at IS NULL
    `;
    const params = [];

    if (search) {
      query += ` AND (d.first_name LIKE ? OR d.last_name LIKE ? OR d.national_id LIKE ? OR d.email LIKE ? OR d.phone LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += ` AND d.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY d.registration_date DESC`;

    const [drivers] = await pool.query(query, params);

    // Convert to CSV
    const headers = ['Driver ID', 'National ID', 'First Name', 'Last Name', 'Email', 'Phone', 'City', 'Status', 'Registration Date'];
    const csvRows = [headers.join(',')];

    drivers.forEach(driver => {
      const row = [
        driver.driver_id,
        driver.national_id,
        driver.first_name,
        driver.last_name,
        driver.email,
        driver.phone,
        driver.city,
        driver.status,
        driver.registration_date
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=drivers-export-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export drivers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  searchDrivers,
  verifyDriver,
  uploadSignature,
  uploadFingerprint,
  getDriverStatistics,
  checkDuplicate,
  getDriverExamStatus,
  updateDriverStatus,
  exportDrivers
};
