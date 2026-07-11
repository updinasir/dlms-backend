const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const serviceController = require('../controllers/serviceController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const validate = require('../middleware/validate');

// Get all services
router.get('/', auth, checkPermission('services', 'view'), serviceController.getAllServices);

// Get active services (for payment form dropdown)
router.get('/active', auth, checkPermission('services', 'view'), serviceController.getActiveServices);

// Get service statistics
router.get('/stats/overview', auth, authorize('admin', 'staff'), checkPermission('services', 'view'), serviceController.getServiceStatistics);

// Get service by ID
router.get('/:id', auth, checkPermission('services', 'view'), serviceController.getServiceById);

// Get service price history
router.get('/:id/price-history', auth, authorize('super_admin'), checkPermission('services', 'view'), serviceController.getServicePriceHistory);

// Create service (Super Admin only)
router.post('/', auth, authorize('super_admin'), checkPermission('services', 'create'), [
  body('service_code').trim().notEmpty().withMessage('Service code is required'),
  body('service_name').trim().notEmpty().withMessage('Service name is required'),
  body('official_price').isNumeric().withMessage('Official price must be a number'),
  body('effective_date').optional().isISO8601().withMessage('Invalid effective date')
], validate, serviceController.createService);

// Update service (Super Admin only)
router.put('/:id', auth, authorize('super_admin'), checkPermission('services', 'edit'), [
  body('service_code').optional().trim().notEmpty().withMessage('Service code cannot be empty'),
  body('service_name').optional().trim().notEmpty().withMessage('Service name cannot be empty'),
  body('official_price').optional().isNumeric().withMessage('Official price must be a number'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status'),
  body('effective_date').optional().isISO8601().withMessage('Invalid effective date')
], validate, serviceController.updateService);

// Delete service (Super Admin only)
router.delete('/:id', auth, authorize('super_admin'), checkPermission('services', 'delete'), serviceController.deleteService);

module.exports = router;
