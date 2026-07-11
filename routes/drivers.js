const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const driverController = require('../controllers/driverController');
const driverPortalController = require('../controllers/driverPortalController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { upload } = require('../middleware/upload');
const validate = require('../middleware/validate');

const setDriverUploadType = (req, res, next) => {
  req.body.type = 'drivers';
  next();
};

// Get all drivers
router.get('/', auth, checkPermission('drivers', 'view'), driverController.getAllDrivers);

// Public driver search by query
router.get('/public/search/:query', driverController.searchDrivers);

// Public driver verification (for QR code scans)
router.get('/verify/:id', driverController.verifyDriver);

// Search drivers (authenticated)
router.get('/search/:query', auth, checkPermission('drivers', 'view'), driverController.searchDrivers);

// Get driver statistics
router.get('/stats/overview', auth, authorize('admin', 'staff'), checkPermission('drivers', 'view'), driverController.getDriverStatistics);

// Check for duplicate driver records
router.get('/check-duplicate', auth, checkPermission('drivers', 'view'), driverController.checkDuplicate);

// Get driver exam status for license issuance
router.get('/:driverId/exam-status', auth, checkPermission('drivers', 'view'), driverController.getDriverExamStatus);

// Update driver status
router.patch('/:id/status', auth, authorize('admin', 'staff'), checkPermission('drivers', 'edit'), driverController.updateDriverStatus);

// Export drivers to CSV
router.get('/export', auth, authorize('admin', 'staff'), checkPermission('drivers', 'view'), driverController.exportDrivers);

// Driver self-service portal
router.get('/portal/me', auth, driverPortalController.getMyPortalData);
router.get('/portal/notifications', auth, driverPortalController.getMyNotifications);
router.patch('/portal/notifications/:id/read', auth, driverPortalController.markMyNotificationRead);

// Get driver by ID
router.get('/:id', auth, checkPermission('drivers', 'view'), driverController.getDriverById);

// Create driver
router.post('/', auth, authorize('admin', 'staff'), checkPermission('drivers', 'create'), setDriverUploadType, upload.single('photo'), [
  body('national_id').trim().notEmpty().withMessage('National ID is required'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required')
], validate, driverController.createDriver);

// Update driver
router.put('/:id', auth, authorize('admin', 'staff'), checkPermission('drivers', 'edit'), setDriverUploadType, upload.single('photo'), [
  body('national_id').optional().trim().notEmpty(),
  body('first_name').optional().trim().notEmpty(),
  body('last_name').optional().trim().notEmpty()
], validate, driverController.updateDriver);

// Delete driver (admin only)
router.delete('/:id', auth, authorize('admin'), checkPermission('drivers', 'delete'), driverController.deleteDriver);

// Biometric uploads
router.post('/:id/signature', auth, authorize('admin', 'staff'), checkPermission('drivers', 'edit'), setDriverUploadType, upload.single('signature'), driverController.uploadSignature);
router.post('/:id/fingerprint', auth, authorize('admin', 'staff'), checkPermission('drivers', 'edit'), [
  body('fingerprint_data').notEmpty().withMessage('Fingerprint data is required')
], validate, driverController.uploadFingerprint);

module.exports = router;
