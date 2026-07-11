const bcrypt = require('bcryptjs');
const User = require('../models/User');
const pool = require('../config/database');
const { validatePasswordStrength } = require('../utils/security');
const notificationService = require('../services/notificationService');

const ROLE_NAMES = { 1: 'Super Admin', 2: 'Admin', 3: 'Examiner', 4: 'Staff', 5: 'Cashier', 6: 'Driver' };

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const { role, search, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { role, search, status, limit, offset };
    const users = await User.findAll(filters);
    const total = await User.count(filters);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get examiners (for appointment/exam scheduling) - accessible to admin & staff
const getExaminers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, full_name, email, department FROM users WHERE role_id = 3 AND status = 'Active' ORDER BY full_name ASC"
    );
    res.json({ examiners: rows });
  } catch (error) {
    console.error('Get examiners error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create user
const createUser = async (req, res) => {
  try {
    const { password, ...rest } = req.body;

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({ message: 'Password does not meet requirements', errors: passwordCheck.errors });
    }

    // Check for duplicate email
    const existingUser = await User.findByEmail(rest.email);
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      ...rest,
      password: hashedPassword,
      created_at: new Date()
    };

    const user = await User.create(userData);

    notificationService.safeNotify('superadmin.user_created', {
      data: { name: user.full_name, role: ROLE_NAMES[user.role_id] || 'User', recordId: user.user_id, link: `/dashboard/admin/users` },
      target: { roles: ['super_admin'] },
      triggeredBy: req.user?.id || null
    });

    res.status(201).json({
      message: 'User created successfully',
      user
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    // Check for duplicate email if being updated
    if (req.body.email) {
      const existingUser = await User.findByEmail(req.body.email);
      if (existingUser && existingUser.id != req.params.id) {
        return res.status(409).json({ message: 'Another user already uses this email address' });
      }
    }

    const user = await User.update(req.params.id, req.body);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    notificationService.safeNotify('superadmin.user_updated', {
      data: { name: user.full_name, recordId: user.user_id, link: `/dashboard/admin/users` },
      target: { roles: ['super_admin'] },
      triggeredBy: req.user?.id || null
    });

    res.json({
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const existing = await User.findById(req.params.id);
    await User.delete(req.params.id);

    notificationService.safeNotify('superadmin.user_deleted', {
      data: { name: existing?.full_name || `User #${req.params.id}`, link: `/dashboard/admin/users` },
      target: { roles: ['super_admin'] },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update current authenticated user's profile (self-service)
const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check for duplicate email if being updated
    if (req.body.email) {
      const otherUser = await User.findByEmail(req.body.email);
      if (otherUser && String(otherUser.id) !== String(userId)) {
        return res.status(409).json({ message: 'Another user already uses this email address' });
      }
    }

    const updateData = { ...req.body };
    if (req.file) {
      updateData.profile_image = `/uploads/profiles/${req.file.filename}`;
    }

    const user = await User.update(userId, updateData);

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update my profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user status
const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const user = await User.update(req.params.id, { status });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User status updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get complete user activity details for audit viewer
const getUserActivity = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { from_date, to_date, module, action, status, limit = 200 } = req.query;
    const dateFilter = [];
    if (from_date) dateFilter.push(`action_time >= '${from_date}'`);
    if (to_date) dateFilter.push(`action_time <= '${to_date} 23:59:59'`);

    const auditWhere = ['user_id = ?'];
    const auditParams = [userId];
    if (module) { auditWhere.push('module = ?'); auditParams.push(module); }
    if (action) { auditWhere.push('action_performed = ?'); auditParams.push(action); }
    if (status) { auditWhere.push('status = ?'); auditParams.push(status); }
    if (dateFilter.length) { auditWhere.push(dateFilter.join(' AND ')); }

    const [auditLogs] = await pool.query(
      `SELECT * FROM audit_logs WHERE ${auditWhere.join(' AND ')} ORDER BY action_time DESC LIMIT ?`,
      [...auditParams, parseInt(limit)]
    );

    const [loginHistory] = await pool.query(
      `SELECT * FROM login_history WHERE user_id = ? ORDER BY login_time DESC LIMIT ?`,
      [userId, parseInt(limit)]
    );

    const [sessions] = await pool.query(
      `SELECT * FROM user_sessions WHERE user_id = ? ORDER BY login_time DESC LIMIT ?`,
      [userId, parseInt(limit)]
    );

    const [stats] = await pool.query(`
      SELECT
        COUNT(*) as total_actions,
        SUM(CASE WHEN action_performed = 'POST' THEN 1 ELSE 0 END) as total_created,
        SUM(CASE WHEN action_performed = 'PUT' OR action_performed = 'PATCH' THEN 1 ELSE 0 END) as total_updated,
        SUM(CASE WHEN action_performed = 'DELETE' THEN 1 ELSE 0 END) as total_deleted,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed,
        COUNT(DISTINCT module) as modules_used
      FROM audit_logs
      WHERE user_id = ?
    `, [userId]);

    const [loginStats] = await pool.query(`
      SELECT
        COUNT(*) as total_logins,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_logins,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_logins,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_sessions
      FROM login_history
      WHERE user_id = ?
    `, [userId]);

    const [actionStats] = await pool.query(
      `SELECT action_performed, COUNT(*) as count FROM audit_logs WHERE user_id = ? GROUP BY action_performed ORDER BY count DESC`,
      [userId]
    );

    const [moduleStats] = await pool.query(
      `SELECT module, COUNT(*) as count FROM audit_logs WHERE user_id = ? AND module IS NOT NULL GROUP BY module ORDER BY count DESC`,
      [userId]
    );

    res.json({
      user,
      auditLogs,
      loginHistory,
      sessions,
      statistics: {
        ...stats[0],
        ...loginStats[0],
        actionStats,
        moduleStats
      }
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllUsers,
  getExaminers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  getUserActivity,
  updateMyProfile
};
