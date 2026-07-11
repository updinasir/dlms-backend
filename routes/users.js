const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { auth, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { upload } = require('../middleware/upload');

const setProfileUploadType = (req, res, next) => {
  req.body.type = 'profile';
  next();
};

// Get all users (admin only)
router.get('/', auth, authorize('admin'), userController.getAllUsers);

// Get active examiners (admin + staff) - for appointment/exam scheduling
router.get('/examiners/list', auth, authorize('staff'), userController.getExaminers);

// Get user by ID - only admin or the same authenticated user (self)
router.get('/:id', auth, (req, res, next) => {
  // Allow self-access
  if (String(req.user?.id) === String(req.params.id)) {
    return next();
  }
  // Otherwise require admin role
  return require('../middleware/auth').authorize('admin')(req, res, next);
}, userController.getUserById);

// Create user (admin only)
router.post('/', auth, authorize('admin'), [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role_id').optional().isInt().withMessage('Role ID must be a number'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive')
], validate, userController.createUser);

// Update user (admin only)
router.put('/:id', auth, authorize('admin'), [
  body('full_name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role_id').optional().isInt(),
  body('status').optional().isIn(['Active', 'Inactive'])
], validate, userController.updateUser);

// Delete user (admin only)
router.delete('/:id', auth, authorize('admin'), userController.deleteUser);

// Get complete user activity details (admin only)
router.get('/:id/activity', auth, authorize('admin'), userController.getUserActivity);

// Update current authenticated user's profile (self-service)
router.patch('/me', auth, setProfileUploadType, upload.single('profile_image'), userController.updateMyProfile);

// Update user status (admin only)
router.patch('/:id/status', auth, authorize('admin'), [
  body('status').isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive')
], validate, userController.updateUserStatus);

module.exports = router;
