const pool = require('../config/database');

async function setup() {
  try {
    // Create permissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        permission_id INT AUTO_INCREMENT PRIMARY KEY,
        module VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        label VARCHAR(100) NOT NULL,
        UNIQUE KEY unique_permission (module, action)
      )
    `);
    console.log('permissions table created');

    // Create role_permissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INT NOT NULL,
        permission_id INT NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE
      )
    `);
    console.log('role_permissions table created');

    // Seed default permissions
    const permissions = [
      // Dashboard
      { module: 'dashboard', action: 'view', label: 'View Dashboard' },
      // Drivers
      { module: 'drivers', action: 'view', label: 'View Drivers' },
      { module: 'drivers', action: 'create', label: 'Create Driver' },
      { module: 'drivers', action: 'edit', label: 'Edit Driver' },
      { module: 'drivers', action: 'delete', label: 'Delete Driver' },
      // Licenses
      { module: 'licenses', action: 'view', label: 'View Licenses' },
      { module: 'licenses', action: 'create', label: 'Create License' },
      { module: 'licenses', action: 'edit', label: 'Edit License' },
      { module: 'licenses', action: 'delete', label: 'Delete License' },
      // Exams
      { module: 'exams', action: 'view', label: 'View Exams' },
      { module: 'exams', action: 'create', label: 'Create Exam' },
      { module: 'exams', action: 'edit', label: 'Edit Exam' },
      { module: 'exams', action: 'delete', label: 'Delete Exam' },
      // Appointments
      { module: 'appointments', action: 'view', label: 'View Appointments' },
      { module: 'appointments', action: 'create', label: 'Create Appointment' },
      { module: 'appointments', action: 'edit', label: 'Edit Appointment' },
      { module: 'appointments', action: 'delete', label: 'Delete Appointment' },
      // Payments
      { module: 'payments', action: 'view', label: 'View Payments' },
      { module: 'payments', action: 'create', label: 'Create Payment' },
      { module: 'payments', action: 'edit', label: 'Edit Payment' },
      { module: 'payments', action: 'delete', label: 'Delete Payment' },
      // Reports
      { module: 'reports', action: 'view', label: 'View Reports' },
      // AI Features
      { module: 'ai', action: 'view', label: 'View AI Features' },
      { module: 'ai', action: 'use', label: 'Use AI Features' },
      // Users (admin only)
      { module: 'users', action: 'view', label: 'View Users' },
      { module: 'users', action: 'create', label: 'Create User' },
      { module: 'users', action: 'edit', label: 'Edit User' },
      { module: 'users', action: 'delete', label: 'Delete User' },
      // Roles (super admin only)
      { module: 'roles', action: 'view', label: 'View Roles' },
      { module: 'roles', action: 'create', label: 'Create Role' },
      { module: 'roles', action: 'edit', label: 'Edit Role' },
      { module: 'roles', action: 'delete', label: 'Delete Role' },
      { module: 'roles', action: 'manage_permissions', label: 'Manage Permissions' }
    ];

    for (const p of permissions) {
      await pool.query(
        `INSERT INTO permissions (module, action, label) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label)`,
        [p.module, p.action, p.label]
      );
    }
    console.log('permissions seeded');

    // Grant all permissions to Super Admin (role_id 1)
    const [allPerms] = await pool.query('SELECT permission_id FROM permissions');
    for (const p of allPerms) {
      await pool.query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
        [1, p.permission_id]
      );
    }
    console.log('super admin granted all permissions');

    // Grant standard permissions to Admin (role_id 2)
    const adminModules = [
      'dashboard', 'drivers', 'licenses', 'exams', 'appointments',
      'payments', 'reports', 'ai'
    ];
    for (const mod of adminModules) {
      const [modPerms] = await pool.query(
        'SELECT permission_id FROM permissions WHERE module = ?',
        [mod]
      );
      for (const p of modPerms) {
        await pool.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          [2, p.permission_id]
        );
      }
    }
    console.log('admin granted standard permissions');

    process.exit(0);
  } catch (err) {
    console.error('Setup failed:', err);
    process.exit(1);
  }
}

setup();
