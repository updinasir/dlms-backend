const { Permission, Role } = require('../models/Permission');
const User = require('../models/User');

// Get all permissions
const getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.findAll();
    const grouped = permissions.reduce((acc, p) => {
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p);
      return acc;
    }, {});
    res.json({ permissions: grouped });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get permissions for a role
const getRolePermissions = async (req, res) => {
  try {
    const permissions = await Permission.findByRoleId(req.params.id);
    res.json({ permissions });
  } catch (error) {
    console.error('Get role permissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Set permissions for a role
const setRolePermissions = async (req, res) => {
  try {
    const { permissionIds } = req.body;
    await Permission.setRolePermissions(req.params.id, permissionIds);
    const permissions = await Permission.findByRoleId(req.params.id);
    res.json({ message: 'Permissions updated', permissions });
  } catch (error) {
    console.error('Set role permissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get current user permissions
const getMyPermissions = async (req, res) => {
  try {
    const permissions = await Permission.getUserPermissions(req.user.id);
    const grouped = permissions.reduce((acc, p) => {
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p.action);
      return acc;
    }, {});
    res.json({ permissions: grouped });
  } catch (error) {
    console.error('Get my permissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all roles with permissions
const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.findWithPermissions();
    res.json({ roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create role
const createRole = async (req, res) => {
  try {
    const role = await Role.create({ role_name: req.body.role_name });
    res.status(201).json({ message: 'Role created', role });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update role
const updateRole = async (req, res) => {
  try {
    const role = await Role.update(req.params.id, { role_name: req.body.role_name });
    res.json({ message: 'Role updated', role });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete role
const deleteRole = async (req, res) => {
  try {
    await Role.delete(req.params.id);
    res.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all users with roles
const getAllUsers = async (req, res) => {
  try {
    const { search, role, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const filters = { search, role, status, limit, offset };
    const users = await User.findAll(filters);
    const total = await User.count(filters);

    const roles = await Role.findAll();

    res.json({
      users,
      roles,
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

// Update user role
const updateUserRole = async (req, res) => {
  try {
    const user = await User.update(req.params.id, { role_id: req.body.role_id });
    res.json({ message: 'User role updated', user });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Toggle user status
const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    const updated = await User.update(req.params.id, { status: newStatus });
    res.json({ message: `User ${newStatus.toLowerCase()}d`, user: updated });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllPermissions,
  getRolePermissions,
  setRolePermissions,
  getMyPermissions,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getAllUsers,
  updateUserRole,
  toggleUserStatus
};
