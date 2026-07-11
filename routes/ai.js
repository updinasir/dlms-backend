const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { auth, authorize } = require('../middleware/auth');

// Detect fake document
router.post('/detect-fake/:document_id', auth, authorize('admin', 'staff'), aiController.detectFakeDocument);

// Calculate risk score
router.get('/risk-score/:driver_id', auth, authorize('admin', 'staff'), aiController.calculateRiskScore);

// Face match
router.post('/face-match/:driver_id', auth, authorize('admin', 'staff'), aiController.faceMatch);

// Get detection logs
router.get('/detection-logs', auth, authorize('admin'), aiController.getDetectionLogs);

module.exports = router;
