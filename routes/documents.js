const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const documentController = require('../controllers/documentController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const validate = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

// Get all documents
router.get('/', auth, checkPermission('documents', 'view'), documentController.getAllDocuments);

// Get document by ID
router.get('/:id', auth, checkPermission('documents', 'view'), documentController.getDocumentById);

// Upload document
router.post('/upload', auth, authorize('admin', 'staff'), checkPermission('documents', 'create'), uploadLimiter, upload.single('file'), [
  body('driver_id').notEmpty().withMessage('Driver ID is required'),
  body('document_type').optional().trim()
], validate, documentController.uploadDocument);

// Update document
router.put('/:id', auth, authorize('admin', 'staff'), checkPermission('documents', 'edit'), documentController.updateDocument);

// Delete document
router.delete('/:id', auth, authorize('admin', 'staff'), checkPermission('documents', 'delete'), documentController.deleteDocument);

// Get driver documents
router.get('/driver/:driverId', auth, checkPermission('documents', 'view'), documentController.getDriverDocuments);

// Securely download document file
router.get('/:id/download', auth, checkPermission('documents', 'view'), documentController.downloadDocument);

module.exports = router;
