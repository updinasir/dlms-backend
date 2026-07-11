const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const roleController = require('../controllers/roleController');
const { auth, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { checkPermission } = require('../middleware/permissions');

// Get current user permissions
router.get('/my-permissions', auth, roleController.getMyPermissions);

// Get all permissions (admin/super admin)
router.get('/permissions', auth, checkPermission('roles', 'view'), roleController.getAllPermissions);

// Role management (super admin only)
router.get('/', auth, checkPermission('roles', 'view'), roleController.getAllRoles);
router.post('/', auth, checkPermission('roles', 'create'), [
  body('role_name').notEmpty().withMessage('Role name is required')
], validate, roleController.createRole);
router.put('/:id', auth, checkPermission('roles', 'edit'), [
  body('role_name').notEmpty().withMessage('Role name is required')
], validate, roleController.updateRole);
router.delete('/:id', auth, checkPermission('roles', 'delete'), roleController.deleteRole);

// Role permissions
router.get('/:id/permissions', auth, checkPermission('roles', 'view'), roleController.getRolePermissions);
router.put('/:id/permissions', auth, checkPermission('roles', 'manage_permissions'), [
  body('permissionIds').isArray().withMessage('permissionIds must be an array')
], validate, roleController.setRolePermissions);

// User management (admin/super admin)
router.get('/users/all', auth, checkPermission('users', 'view'), roleController.getAllUsers);
router.patch('/users/:id/role', auth, checkPermission('users', 'edit'), [
  body('role_id').isInt().withMessage('Role ID must be a number')
], validate, roleController.updateUserRole);
router.patch('/users/:id/status', auth, checkPermission('users', 'edit'), roleController.toggleUserStatus);

module.exports = router;
