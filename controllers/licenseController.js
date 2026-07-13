const License = require('../models/License');
const QRCode = require('qrcode');
const pool = require('../config/database');
const notificationService = require('../services/notificationService');

const safeSend = (opts) => notificationService.send(opts).catch((e) => console.error('send error:', e.message));

// Generate a unique sequential license number: SL-000001, SL-000002, ...
const generateLicenseNumber = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    // Find the highest existing SL-###### number and increment it
    const [rows] = await pool.query(
      `SELECT license_number FROM licenses
       WHERE license_number REGEXP '^SL-[0-9]+$'
       ORDER BY CAST(SUBSTRING(license_number, 4) AS UNSIGNED) DESC
       LIMIT 1`
    );
    let next = 1;
    if (rows.length > 0) {
      next = parseInt(rows[0].license_number.slice(3), 10) + 1;
    }
    const candidate = `SL-${String(next).padStart(6, '0')}`;
    const [existing] = await pool.query(
      'SELECT license_id FROM licenses WHERE license_number = ? LIMIT 1',
      [candidate]
    );
    if (existing.length === 0) {
      return candidate;
    }
  }
  // Fallback to a timestamp-based unique value if contention persists
  return `SL-${Date.now()}`;
};

// Get all licenses
const getAllLicenses = async (req, res) => {
  try {
    const { search, status, category, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { search, status, category, limit, offset };
    const licenses = await License.findAll(filters);
    const total = await License.count(filters);

    res.json({
      licenses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get licenses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Preview the next auto-generated license number (does not reserve it)
const getNextLicenseNumber = async (req, res) => {
  try {
    const licenseNumber = await generateLicenseNumber();
    res.json({ license_number: licenseNumber });
  } catch (error) {
    console.error('Get next license number error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get license by ID
const getLicenseById = async (req, res) => {
  try {
    const license = await License.findById(req.params.id);
    if (!license) {
      return res.status(404).json({ message: 'License not found' });
    }

    res.json({ license });
  } catch (error) {
    console.error('Get license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create license
const createLicense = async (req, res) => {
  try {
    // License number is always auto-generated sequentially (SL-000001, ...)
    const licenseNumber = await generateLicenseNumber();

    // Verify driver exists and is not deleted
    const [driverCheck] = await pool.query(
      'SELECT driver_id FROM drivers WHERE driver_id = ? AND deleted_at IS NULL LIMIT 1',
      [req.body.driver_id]
    );
    if (driverCheck.length === 0) {
      return res.status(404).json({ message: 'Driver not found or has been deleted' });
    }

    // Gate: a license cannot be issued until both Theory and Practical tests are passed
    const [theoryPass] = await pool.query(
      'SELECT theory_exam_id FROM theory_exams WHERE driver_id = ? AND result = "Pass" LIMIT 1',
      [req.body.driver_id]
    );
    if (theoryPass.length === 0) {
      return res.status(400).json({ message: 'Driver must pass the Theory Test before a license can be issued' });
    }
    const [practicalPass] = await pool.query(
      'SELECT practical_exam_id FROM practical_exams WHERE driver_id = ? AND result = "Pass" LIMIT 1',
      [req.body.driver_id]
    );
    if (practicalPass.length === 0) {
      return res.status(400).json({ message: 'Driver must pass the Practical Test before a license can be issued' });
    }

    // Gate: only one active license per category per driver
    if (req.body.category_id) {
      const [activeLicense] = await pool.query(
        'SELECT license_id FROM licenses WHERE driver_id = ? AND category_id = ? AND license_status = "Active" AND deleted_at IS NULL LIMIT 1',
        [req.body.driver_id, req.body.category_id]
      );
      if (activeLicense.length > 0) {
        return res.status(409).json({ message: 'Driver already has an active license for this category' });
      }
    }

    const licenseData = {
      driver_id: req.body.driver_id,
      category_id: req.body.category_id,
      license_number: licenseNumber,
      issue_date: req.body.issue_date,
      expiry_date: req.body.expiry_date,
      license_status: 'Pending',
      workflow_status: 'Pending Payment'
    };

    const license = await License.create(licenseData);

    // Generate QR code
    const qrCodeData = JSON.stringify({
      license_number: license.license_number,
      driver_name: `${license.first_name} ${license.last_name}`,
      category_id: license.category_id,
      expiry_date: license.expiry_date
    });

    const qrCode = await QRCode.toDataURL(qrCodeData);

    // Update license with QR code
    await License.update(license.license_id, { qr_code: qrCode });

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'CREATE',
        table_name: 'licenses',
        record_id: license.license_id,
        action_time: new Date()
      });
    } catch (auditError) {
      console.warn('License audit log skipped:', auditError.message);
    }

    // Notify driver that the license is pending payment
    safeSend({
      title: 'License Pending Payment',
      message: `Your license ${license.license_number} is pending payment. Please complete payment to proceed.`,
      category: 'Information',
      module: 'licenses',
      link: '/dashboard/licenses',
      target: { driverId: license.driver_id },
      triggeredBy: req.user?.id || null
    });

    res.status(201).json({
      message: 'License created successfully',
      license: { ...license, qr_code: qrCode }
    });
  } catch (error) {
    console.error('Create license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update license
const updateLicense = async (req, res) => {
  try {
    const license = await License.update(req.params.id, req.body);

    if (!license) {
      return res.status(404).json({ message: 'License not found' });
    }

    // Notify driver on meaningful status changes
    const newStatus = String(req.body.license_status || '').toLowerCase();
    if (newStatus === 'active') {
      notificationService.safeNotify('driver.license_ready', {
        data: { ref: license.license_number, recordId: license.license_id, link: `/dashboard/licenses/${license.license_id}` },
        target: { driverId: license.driver_id },
        triggeredBy: req.user?.id || null
      });
    } else if (['revoked', 'suspended'].includes(newStatus)) {
      notificationService.safeNotify('driver.license_rejected', {
        data: { ref: license.license_number, reason: req.body.reason || '', recordId: license.license_id, link: `/dashboard/licenses/${license.license_id}` },
        target: { driverId: license.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({
      message: 'License updated successfully',
      license
    });
  } catch (error) {
    console.error('Update license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete license
const deleteLicense = async (req, res) => {
  try {
    await License.delete(req.params.id);

    res.json({ message: 'License deleted successfully' });
  } catch (error) {
    console.error('Delete license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Renew license
const renewLicense = async (req, res) => {
  try {
    const { expiry_date, notes } = req.body;
    
    const renewalData = {
      expiry_date,
      notes
    };

    const license = await License.renew(req.params.id, renewalData);

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'UPDATE',
        table_name: 'licenses',
        record_id: license.license_id,
        action_time: new Date()
      });
    } catch (auditError) {
      console.warn('License audit log skipped:', auditError.message);
    }

    res.json({
      message: 'License renewed successfully',
      license
    });
  } catch (error) {
    console.error('Renew license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Suspend license
const suspendLicense = async (req, res) => {
  try {
    const { reason } = req.body;
    const license = await License.suspend(req.params.id, reason);

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'UPDATE',
        table_name: 'licenses',
        record_id: license.license_id,
        action_time: new Date()
      });
    } catch (auditError) {
      console.warn('License audit log skipped:', auditError.message);
    }

    res.json({
      message: 'License suspended successfully',
      license
    });
  } catch (error) {
    console.error('Suspend license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Revoke license
const revokeLicense = async (req, res) => {
  try {
    const { reason } = req.body;
    const license = await License.revoke(req.params.id, reason);

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'UPDATE',
        table_name: 'licenses',
        record_id: license.license_id,
        action_time: new Date()
      });
    } catch (auditError) {
      console.warn('License audit log skipped:', auditError.message);
    }

    res.json({
      message: 'License revoked successfully',
      license
    });
  } catch (error) {
    console.error('Revoke license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- License workflow transitions ---

const verifyLicensePayment = async (req, res) => {
  try {
    const license = await License.verifyPayment(req.params.id, req.user?.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    safeSend({
      title: 'Payment Verified',
      message: `Payment for license ${license.license_number} has been verified. License is ready for approval.`,
      category: 'Success',
      module: 'payments',
      link: `/dashboard/licenses/${license.license_id}`,
      target: { roles: ['super_admin', 'admin'] },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'Payment verified successfully', license });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const approveLicense = async (req, res) => {
  try {
    const license = await License.approveLicense(req.params.id, req.user?.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    safeSend({
      title: 'License Approved',
      message: `License ${license.license_number} has been approved and is ready for printing.`,
      category: 'Success',
      module: 'licenses',
      link: `/dashboard/licenses/${license.license_id}`,
      target: { roles: ['super_admin', 'admin', 'cashier'] },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'License approved successfully', license });
  } catch (error) {
    console.error('Approve license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const printLicense = async (req, res) => {
  try {
    const license = await License.printLicense(req.params.id, req.user?.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    safeSend({
      title: 'License Printed',
      message: `License ${license.license_number} has been printed and is ready for collection.`,
      category: 'Information',
      module: 'licenses',
      link: `/dashboard/licenses/${license.license_id}`,
      target: { roles: ['super_admin', 'admin', 'staff'] },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'License printed successfully', license });
  } catch (error) {
    console.error('Print license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const markLicenseReadyForCollection = async (req, res) => {
  try {
    const license = await License.markReadyForCollection(req.params.id, req.user?.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    safeSend({
      title: 'License Ready for Collection',
      message: `Your license ${license.license_number} is ready for collection. Please visit the office with your ID.`,
      category: 'Success',
      module: 'licenses',
      link: '/dashboard/licenses',
      target: { driverId: license.driver_id },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'License marked ready for collection', license });
  } catch (error) {
    console.error('Ready for collection error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const collectLicense = async (req, res) => {
  try {
    const license = await License.collectLicense(req.params.id, req.user?.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    safeSend({
      title: 'License Collected',
      message: `Your license ${license.license_number} has been collected. It is now active.`,
      category: 'Success',
      module: 'licenses',
      link: '/dashboard/licenses',
      target: { driverId: license.driver_id },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'License collected successfully', license });
  } catch (error) {
    console.error('Collect license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Verify license
const verifyLicense = async (req, res) => {
  try {
    const { license_number } = req.params;
    const license = await License.findByLicenseNumber(license_number);

    if (!license) {
      return res.status(404).json({ message: 'License not found' });
    }

    const isValid = license.license_status === 'Active' && new Date(license.expiry_date) > new Date();

    res.json({
      valid: isValid,
      license: {
        license_number: license.license_number,
        driver_name: `${license.first_name} ${license.last_name}`,
        category_id: license.category_id,
        license_status: license.license_status,
        expiry_date: license.expiry_date,
        issue_date: license.issue_date
      }
    });
  } catch (error) {
    console.error('Verify license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Search license by national ID
const searchLicenseByNationalId = async (req, res) => {
  try {
    const { nationalId } = req.params;

    if (!nationalId) {
      return res.status(400).json({ message: 'National ID is required' });
    }

    const licenses = await License.findByNationalId(nationalId);

    res.json({ licenses });
  } catch (error) {
    console.error('Search license by national ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get license statistics
const getLicenseStatistics = async (req, res) => {
  try {
    const stats = await License.getStatistics();
    res.json({ statistics: stats });
  } catch (error) {
    console.error('Get license statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get expiring licenses
const getExpiringLicenses = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const licenses = await License.getExpiringSoon(parseInt(days));
    res.json({ licenses });
  } catch (error) {
    console.error('Get expiring licenses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get license categories
const getLicenseCategories = async (req, res) => {
  try {
    const [categories] = await pool.query(`
      SELECT category_id, category_code, category_name, description
      FROM license_categories
      ORDER BY category_code
    `);
    res.json({ categories });
  } catch (error) {
    console.error('Get license categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create license category
const createLicenseCategory = async (req, res) => {
  try {
    const { category_code, category_name, description } = req.body;
    
    if (!category_code || !category_name) {
      return res.status(400).json({ message: 'Category code and name are required' });
    }

    // Check if category code already exists
    const [existing] = await pool.query(
      'SELECT category_id FROM license_categories WHERE category_code = ?',
      [category_code]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Category code already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO license_categories (category_code, category_name, description) VALUES (?, ?, ?)',
      [category_code, category_name, description || null]
    );

    const [newCategory] = await pool.query(
      'SELECT * FROM license_categories WHERE category_id = ?',
      [result.insertId]
    );

    res.status(201).json({ category: newCategory[0] });
  } catch (error) {
    console.error('Create license category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update license category
const updateLicenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_code, category_name, description } = req.body;
    
    if (!category_code || !category_name) {
      return res.status(400).json({ message: 'Category code and name are required' });
    }

    // Check if category code already exists (excluding current category)
    const [existing] = await pool.query(
      'SELECT category_id FROM license_categories WHERE category_code = ? AND category_id != ?',
      [category_code, id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Category code already exists' });
    }

    await pool.query(
      'UPDATE license_categories SET category_code = ?, category_name = ?, description = ? WHERE category_id = ?',
      [category_code, category_name, description || null, id]
    );

    const [updatedCategory] = await pool.query(
      'SELECT * FROM license_categories WHERE category_id = ?',
      [id]
    );

    if (updatedCategory.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ category: updatedCategory[0] });
  } catch (error) {
    console.error('Update license category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete license category
const deleteLicenseCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category is being used by any licenses
    const [licenses] = await pool.query(
      'SELECT COUNT(*) as count FROM licenses WHERE category_id = ? AND deleted_at IS NULL',
      [id]
    );

    if (licenses[0].count > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category that is in use by licenses',
        count: licenses[0].count
      });
    }

    await pool.query(
      'UPDATE license_categories SET deleted_at = NOW() WHERE category_id = ?',
      [id]
    );

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete license category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Check for duplicate license number
const checkDuplicateLicense = async (req, res) => {
  try {
    const { license_number } = req.query;
    
    if (!license_number) {
      return res.status(400).json({ message: 'License number is required' });
    }

    const [rows] = await pool.query(
      'SELECT license_id FROM licenses WHERE license_number = ? AND deleted_at IS NULL LIMIT 1',
      [license_number]
    );
    
    res.json({ exists: rows.length > 0 });
  } catch (error) {
    console.error('Check duplicate license error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get driver exam status
const getDriverExamStatus = async (req, res) => {
  try {
    const driverId = req.params.driverId;
    
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
    res.status(500).json({ message: 'Server error' });
  }
};

// Export licenses to CSV
const exportLicenses = async (req, res) => {
  try {
    const { search, status, workflow, category } = req.query;

    let query = `
      SELECT l.license_id, l.license_number, l.license_status, l.workflow_status, 
             l.issue_date, l.expiry_date, l.city,
             d.first_name, d.last_name, d.national_id,
             lc.category_code, lc.category_name
      FROM licenses l
      LEFT JOIN drivers d ON l.driver_id = d.driver_id
      LEFT JOIN license_categories lc ON l.category_id = lc.category_id
      WHERE l.deleted_at IS NULL
    `;
    const params = [];

    if (search) {
      query += ` AND (l.license_number LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += ` AND l.license_status = ?`;
      params.push(status);
    }

    if (workflow) {
      query += ` AND l.workflow_status = ?`;
      params.push(workflow);
    }

    if (category) {
      query += ` AND l.category_id = ?`;
      params.push(category);
    }

    query += ` ORDER BY l.issue_date DESC`;

    const [licenses] = await pool.query(query, params);

    // Convert to CSV
    const headers = ['License ID', 'License Number', 'Status', 'Workflow', 'Issue Date', 'Expiry Date', 'City', 'First Name', 'Last Name', 'National ID', 'Category Code', 'Category Name'];
    const csvRows = [headers.join(',')];

    licenses.forEach(license => {
      const row = [
        license.license_id,
        license.license_number,
        license.license_status,
        license.workflow_status,
        license.issue_date,
        license.expiry_date,
        license.city,
        license.first_name,
        license.last_name,
        license.national_id,
        license.category_code,
        license.category_name
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=licenses-export-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export licenses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllLicenses,
  getLicenseById,
  createLicense,
  updateLicense,
  deleteLicense,
  renewLicense,
  suspendLicense,
  revokeLicense,
  verifyLicensePayment,
  approveLicense,
  printLicense,
  markLicenseReadyForCollection,
  collectLicense,
  verifyLicense,
  searchLicenseByNationalId,
  getLicenseStatistics,
  getExpiringLicenses,
  getLicenseCategories,
  createLicenseCategory,
  updateLicenseCategory,
  deleteLicenseCategory,
  checkDuplicateLicense,
  getDriverExamStatus,
  getNextLicenseNumber,
  exportLicenses
};
