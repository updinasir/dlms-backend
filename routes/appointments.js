const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const appointmentController = require('../controllers/appointmentController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const validate = require('../middleware/validate');

// Get all appointments
router.get('/', auth, checkPermission('appointments', 'view'), appointmentController.getAllAppointments);

// Create appointment
router.post('/', auth, authorize('admin', 'staff'), checkPermission('appointments', 'create'), [
  body('driver_id').notEmpty().withMessage('Driver ID is required'),
  body('appointment_type').isIn(['Theory Test', 'Practical Test', 'License Collection', 'Renewal']).withMessage('Invalid appointment type'),
  body('appointment_date').notEmpty().withMessage('Appointment date is required')
], validate, appointmentController.createAppointment);

// Get upcoming appointments
router.get('/upcoming/list', auth, authorize('admin', 'staff'), checkPermission('appointments', 'view'), appointmentController.getUpcomingAppointments);

// Get overdue appointments (for notifications)
router.get('/overdue/list', auth, authorize('admin', 'staff'), checkPermission('appointments', 'view'), appointmentController.getOverdueAppointments);

// Get appointment statistics
router.get('/stats/overview', auth, authorize('admin', 'staff'), checkPermission('appointments', 'view'), appointmentController.getAppointmentStatistics);

// Check examiner availability
router.get('/check-availability', auth, checkPermission('appointments', 'view'), appointmentController.checkExaminerAvailability);

// Get appointment by ID
router.get('/:id', auth, checkPermission('appointments', 'view'), appointmentController.getAppointmentById);

// Update appointment
router.put('/:id', auth, authorize('admin', 'staff'), checkPermission('appointments', 'edit'), appointmentController.updateAppointment);

// Delete appointment (admin only)
router.delete('/:id', auth, authorize('admin'), checkPermission('appointments', 'delete'), appointmentController.deleteAppointment);

// Cancel appointment
router.patch('/:id/cancel', auth, authorize('admin', 'staff'), checkPermission('appointments', 'edit'), appointmentController.cancelAppointment);

// Complete appointment
router.patch('/:id/complete', auth, authorize('admin', 'staff'), checkPermission('appointments', 'edit'), appointmentController.completeAppointment);

// --- Lifecycle actions (examiner + admin + staff) ---
router.patch('/:id/check-in', auth, authorize('admin', 'staff', 'examiner'), checkPermission('appointments', 'edit'), appointmentController.checkInAppointment);
router.patch('/:id/waiting', auth, authorize('admin', 'staff', 'examiner'), checkPermission('appointments', 'edit'), appointmentController.setWaitingAppointment);
router.patch('/:id/start', auth, authorize('admin', 'staff', 'examiner'), checkPermission('appointments', 'edit'), appointmentController.startAppointment);
router.patch('/:id/no-show', auth, authorize('admin', 'staff', 'examiner'), checkPermission('appointments', 'edit'), appointmentController.markNoShowAppointment);
router.patch('/:id/late', auth, authorize('admin', 'staff', 'examiner'), checkPermission('appointments', 'edit'), appointmentController.markLateAppointment);

// --- Reschedule workflow ---
// Driver-initiated reschedule request
router.patch('/:id/request-reschedule', auth, appointmentController.requestReschedule);
// Admin approve / reject reschedule request
router.patch('/:id/approve-reschedule', auth, authorize('admin', 'staff'), checkPermission('appointments', 'edit'), appointmentController.approveReschedule);
router.patch('/:id/reject-reschedule', auth, authorize('admin', 'staff'), checkPermission('appointments', 'edit'), appointmentController.rejectReschedule);

// --- Examiner reassignment (admin) ---
router.patch('/:id/reassign-examiner', auth, authorize('admin', 'staff'), checkPermission('appointments', 'edit'), appointmentController.reassignExaminer);

module.exports = router;
