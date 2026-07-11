const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { auth, authorize } = require('../middleware/auth');

// Get all audit logs (admin only)
router.get('/', auth, authorize('admin'), auditLogController.getAuditLogs);

// Get audit log statistics (admin only)
router.get('/stats', auth, authorize('admin'), auditLogController.getAuditLogStats);

// Get login history records (admin only)
router.get('/login-history', auth, authorize('admin'), auditLogController.getLoginHistory);

// Get a single audit log by ID (admin only)
router.get('/:id', auth, authorize('admin'), auditLogController.getAuditLogById);

module.exports = router;
