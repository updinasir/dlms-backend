const { Permission } = require('../models/Permission');

const checkPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      const userRole = req.user?.role;
      if (!userRole) {
        return res.status(403).json({ message: 'No role found' });
      }

      // Super Admin (role_id 1) has all permissions
      if (parseInt(userRole) === 1) {
        return next();
      }

      const hasPerm = await Permission.hasPermission(userRole, module, action);
      if (!hasPerm) {
        return res.status(403).json({
          message: 'Not authorized to access this resource'
        });
      }
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

module.exports = { checkPermission };
