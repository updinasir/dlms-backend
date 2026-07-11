const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Register
router.post('/register', [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], validate, authController.register);

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], validate, authController.login);

// Forgot password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], validate, authController.forgotPassword);

// Reset password
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], validate, authController.resetPassword);

// Get current user
router.get('/me', auth, authController.getMe);

// Update profile
router.put('/profile', auth, [
  body('full_name').optional().trim().notEmpty(),
  body('phone').optional().trim()
], validate, authController.updateProfile);

// Change password
router.put('/change-password', auth, [
  body('currentPassword').optional(),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], validate, authController.changePassword);

// Logout
router.post('/logout', auth, authController.logout);

// Refresh access token (uses refresh cookie)
router.post('/refresh', authController.refresh);

module.exports = router;
