const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const paymentController = require('../controllers/paymentController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const validate = require('../middleware/validate');

// Get all payments
router.get('/', auth, checkPermission('payments', 'view'), paymentController.getAllPayments);

// Get payment statistics
router.get('/stats/overview', auth, checkPermission('payments', 'view'), paymentController.getPaymentStatistics);

// Get total revenue
router.get('/stats/revenue', auth, checkPermission('payments', 'view'), paymentController.getTotalRevenue);

// Get revenue by date range
router.get('/stats/revenue-by-date', auth, checkPermission('payments', 'view'), paymentController.getRevenueByDateRange);

// Export payments to CSV
router.get('/export', auth, authorize('admin', 'staff'), checkPermission('payments', 'view'), paymentController.exportPayments);

// Get payment by ID
router.get('/:id', auth, checkPermission('payments', 'view'), paymentController.getPaymentById);

// Create payment
router.post('/', auth, authorize('admin', 'staff'), checkPermission('payments', 'create'), [
  body('driver_id').notEmpty().withMessage('Driver ID is required'),
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('payment_type').notEmpty().withMessage('Payment type is required'),
  body('payment_method').notEmpty().withMessage('Payment method is required')
], validate, paymentController.createPayment);

// Update payment (admin only)
router.put('/:id', auth, authorize('admin'), checkPermission('payments', 'edit'), paymentController.updatePayment);

// Delete payment (admin only)
router.delete('/:id', auth, authorize('admin'), checkPermission('payments', 'delete'), paymentController.deletePayment);

module.exports = router;
