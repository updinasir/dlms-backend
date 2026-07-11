const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const rateLimit = require('express-rate-limit');

const reportLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });

// Generate driver report
router.get('/drivers', auth, authorize('admin', 'staff'), checkPermission('reports', 'view'), reportLimiter, reportController.generateDriverReport);

// Generate license report
router.get('/licenses', auth, authorize('admin', 'staff'), checkPermission('reports', 'view'), reportLimiter, reportController.generateLicenseReport);

// Generate revenue report
router.get('/revenue', auth, authorize('admin', 'staff'), checkPermission('reports', 'view'), reportLimiter, reportController.generateRevenueReport);

// Generate examiner performance report
router.get('/examiners', auth, authorize('admin', 'staff'), checkPermission('reports', 'view'), reportLimiter, reportController.generateExaminerReport);

// Generate workflow dashboard overview
router.get('/workflow', auth, authorize('admin', 'staff'), checkPermission('reports', 'view'), reportLimiter, reportController.generateWorkflowReport);

module.exports = router;
