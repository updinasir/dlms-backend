const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const licenseController = require('../controllers/licenseController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const validate = require('../middleware/validate');

// Get all licenses
router.get('/', auth, checkPermission('licenses', 'view'), licenseController.getAllLicenses);

// Public license search by national ID
router.get('/public/search/:nationalId', licenseController.searchLicenseByNationalId);

// Verify license (public)
router.get('/verify/:license_number', licenseController.verifyLicense);

// Get license statistics
router.get('/stats/overview', auth, authorize('admin', 'staff'), checkPermission('licenses', 'view'), licenseController.getLicenseStatistics);

// Get expiring licenses
router.get('/stats/expiring', auth, authorize('admin', 'staff'), checkPermission('licenses', 'view'), licenseController.getExpiringLicenses);

// Get license categories (public for form usage, admin-only for management)
router.get('/license-categories', auth, licenseController.getLicenseCategories);

// Create license category
router.post('/license-categories', auth, authorize('admin'), checkPermission('licenses', 'create'), [
  body('category_code').trim().notEmpty().withMessage('Category code is required'),
  body('category_name').trim().notEmpty().withMessage('Category name is required')
], validate, licenseController.createLicenseCategory);

// Update license category
router.put('/license-categories/:id', auth, authorize('admin'), checkPermission('licenses', 'edit'), [
  body('category_code').optional().trim().notEmpty().withMessage('Category code cannot be empty'),
  body('category_name').optional().trim().notEmpty().withMessage('Category name cannot be empty')
], validate, licenseController.updateLicenseCategory);

// Delete license category
router.delete('/license-categories/:id', auth, authorize('admin'), checkPermission('licenses', 'delete'), licenseController.deleteLicenseCategory);

// Check for duplicate license number
router.get('/check-duplicate', auth, checkPermission('licenses', 'view'), licenseController.checkDuplicateLicense);

// Preview the next auto-generated license number
router.get('/next-number', auth, checkPermission('licenses', 'view'), licenseController.getNextLicenseNumber);

// Export licenses to CSV
router.get('/export', auth, authorize('admin', 'staff'), checkPermission('licenses', 'view'), licenseController.exportLicenses);

// Get license by ID
router.get('/:id', auth, checkPermission('licenses', 'view'), licenseController.getLicenseById);

// Create license
router.post('/', auth, authorize('admin', 'staff'), checkPermission('licenses', 'create'), [
  body('driver_id').notEmpty().withMessage('Driver ID is required'),
  body('category_id').notEmpty().withMessage('Category is required'),
  body('issue_date').notEmpty().withMessage('Issue date is required'),
  body('expiry_date').notEmpty().withMessage('Expiry date is required')
], validate, licenseController.createLicense);

// Update license
router.put('/:id', auth, authorize('admin', 'staff'), checkPermission('licenses', 'edit'), [
  body('license_number').optional().trim().notEmpty().withMessage('License number cannot be empty'),
  body('issue_date').optional().notEmpty().withMessage('Issue date cannot be empty'),
  body('expiry_date').optional().notEmpty().withMessage('Expiry date cannot be empty'),
  body('license_status').optional().isIn(['Pending', 'Active', 'Expired', 'Suspended', 'Revoked']).withMessage('Invalid license status'),
  body('workflow_status').optional().isIn(['Pending Payment', 'Approved', 'Printed', 'Ready for Collection', 'Collected']).withMessage('Invalid workflow status')
], validate, licenseController.updateLicense);

// Delete license (admin only)
router.delete('/:id', auth, authorize('admin'), checkPermission('licenses', 'delete'), licenseController.deleteLicense);

// Renew license
router.post('/:id/renew', auth, authorize('admin', 'staff'), checkPermission('licenses', 'edit'), [
  body('expiry_date').notEmpty().withMessage('Expiry date is required')
], validate, licenseController.renewLicense);

// Suspend license
router.post('/:id/suspend', auth, authorize('admin'), checkPermission('licenses', 'edit'), [
  body('reason').notEmpty().withMessage('Reason is required')
], validate, licenseController.suspendLicense);

// Revoke license
router.post('/:id/revoke', auth, authorize('admin'), checkPermission('licenses', 'edit'), [
  body('reason').notEmpty().withMessage('Reason is required')
], validate, licenseController.revokeLicense);

// --- License workflow transitions ---
router.patch('/:id/verify-payment', auth, authorize('admin', 'cashier'), checkPermission('payments', 'edit'), licenseController.verifyLicensePayment);
router.patch('/:id/approve', auth, authorize('admin'), checkPermission('licenses', 'edit'), licenseController.approveLicense);
router.patch('/:id/print', auth, authorize('admin', 'staff'), checkPermission('licenses', 'edit'), licenseController.printLicense);
router.patch('/:id/ready-for-collection', auth, authorize('admin', 'staff'), checkPermission('licenses', 'edit'), licenseController.markLicenseReadyForCollection);
router.patch('/:id/collect', auth, authorize('admin', 'staff'), checkPermission('licenses', 'edit'), licenseController.collectLicense);

// Admin action: send a renewal/expiry notice (email + portal) to the driver
router.post('/:id/send-expiry-notice', auth, authorize('admin'), checkPermission('licenses', 'edit'), licenseController.sendExpiryNoticeToDriver);

module.exports = router;
