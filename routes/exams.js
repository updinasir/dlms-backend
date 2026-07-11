const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const examController = require('../controllers/examController');
const { auth, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const validate = require('../middleware/validate');

// Get all exams
router.get('/', auth, checkPermission('exams', 'view'), examController.getAllExams);

// Get exam statistics
router.get('/stats/overview', auth, authorize('admin', 'staff'), checkPermission('exams', 'view'), examController.getExamStatistics);

// Schedule exam
router.post('/', auth, authorize('admin', 'staff'), checkPermission('exams', 'create'), [
  body('driver_id').notEmpty().withMessage('Driver ID is required'),
  body('exam_type').isIn(['practical', 'theory']).withMessage('Invalid exam type'),
  body('exam_date').notEmpty().withMessage('Exam date is required')
], validate, examController.scheduleExam);

// Submit exam result
router.post('/:id/result', auth, authorize('admin', 'staff'), checkPermission('exams', 'edit'), [
  body('score').isNumeric().withMessage('Score must be a number'),
  body('result').isIn(['Pass', 'Fail']).withMessage('Invalid result')
], validate, examController.submitExamResult);

// Get exam by ID
router.get('/:id', auth, checkPermission('exams', 'view'), examController.getExamById);

// Update exam
router.put('/:id', auth, authorize('admin', 'staff'), checkPermission('exams', 'edit'), [
  body('exam_date').optional().notEmpty().withMessage('Exam date cannot be empty'),
  body('exam_type').optional().isIn(['practical', 'theory']).withMessage('Invalid exam type')
], validate, examController.updateExam);

// Delete exam (admin only)
router.delete('/:id', auth, authorize('admin'), checkPermission('exams', 'delete'), examController.deleteExam);

module.exports = router;
