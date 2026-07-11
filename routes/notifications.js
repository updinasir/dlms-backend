const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const notificationController = require('../controllers/notificationController');
const { auth, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

// -------- Current user (any authenticated role) --------

// My notifications with filters + pagination
router.get('/user/my-notifications', auth, notificationController.getMyNotifications);

// Unread count
router.get('/user/unread-count', auth, notificationController.getUnreadCount);

// Notification preferences
router.get('/user/preferences', auth, notificationController.getPreferences);
router.put('/user/preferences', auth, notificationController.updatePreferences);

// Mark all as read
router.patch('/read-all', auth, notificationController.markAllAsRead);

// -------- Admin: delivery history, email logs, announcements --------

// All notifications (admin history)
router.get('/', auth, authorize('admin'), notificationController.getAllNotifications);

// Email delivery logs (superadmin only)
router.get('/admin/email-logs', auth, authorize('super_admin'), notificationController.getEmailLogs);
router.post('/admin/email-logs/:id/retry', auth, authorize('super_admin'), notificationController.retryEmail);

// Export notification logs (CSV) (superadmin only)
router.get('/admin/export', auth, authorize('super_admin'), notificationController.exportLogs);

// Archive old notifications (superadmin only)
router.post('/admin/archive-old', auth, authorize('super_admin'), notificationController.archiveOld);

// Send announcement (all / roles / user / driver). All staff may send, but the
// controller restricts non-admin audiences to drivers or specific users/drivers.
router.post('/announcement', auth, authorize('staff'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required')
], validate, notificationController.sendAnnouncement);

// Backward-compatible broadcast (drivers)
router.post('/broadcast', auth, authorize('admin'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required')
], validate, notificationController.broadcastNotification);

// Scheduled notifications
router.get('/scheduled', auth, authorize('admin'), notificationController.getScheduledNotifications);
router.post('/scheduled', auth, authorize('admin'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('scheduled_at').notEmpty().withMessage('Scheduled time is required')
], validate, notificationController.scheduleNotification);
router.delete('/scheduled/:id', auth, authorize('admin'), notificationController.cancelScheduledNotification);

// -------- Single notification actions --------

router.get('/:id', auth, notificationController.getNotificationById);
router.patch('/:id/read', auth, notificationController.markAsRead);
router.patch('/:id/unread', auth, notificationController.markAsUnread);
router.patch('/:id/archive', auth, notificationController.archiveNotification);
router.delete('/:id', auth, notificationController.deleteNotification);

module.exports = router;
