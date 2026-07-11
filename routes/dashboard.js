const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { auth, authorize } = require('../middleware/auth');

// Get dashboard statistics
router.get('/statistics', auth, authorize('admin', 'staff'), dashboardController.getDashboardStatistics);

// Get revenue chart data
router.get('/revenue-chart', auth, authorize('admin', 'staff'), dashboardController.getRevenueChartData);

// Get license status distribution
router.get('/license-distribution', auth, authorize('admin', 'staff'), dashboardController.getLicenseStatusDistribution);

// Get exam results chart
router.get('/exam-results', auth, authorize('admin', 'staff'), dashboardController.getExamResultsChart);

module.exports = router;
