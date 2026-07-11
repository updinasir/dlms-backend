const pool = require('../config/database');

async function assignLogicalRoles() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get all permissions
    const [allPerms] = await connection.query('SELECT permission_id, module, action FROM permissions ORDER BY permission_id');
    const permMap = {};
    allPerms.forEach(p => {
      permMap[p.module + '.' + p.action] = p.permission_id;
    });

    function getIds(keys) {
      return keys.map(k => permMap[k]).filter(Boolean);
    }

    // --- Role 1: Super Admin (already has all, ensure it stays) ---
    const superAdminIds = allPerms.map(p => p.permission_id);

    // --- Role 2: Admin ---
    // Admin can do everything EXCEPT role management (create/edit/delete roles, manage permissions)
    const adminKeys = [
      'dashboard.view',
      'drivers.view', 'drivers.create', 'drivers.edit', 'drivers.delete',
      'licenses.view', 'licenses.create', 'licenses.edit', 'licenses.delete',
      'exams.view', 'exams.create', 'exams.edit', 'exams.delete',
      'appointments.view', 'appointments.create', 'appointments.edit', 'appointments.delete',
      'payments.view', 'payments.create', 'payments.edit', 'payments.delete',
      'reports.view',
      'ai.view', 'ai.use',
      'users.view', 'users.create', 'users.edit', 'users.delete'
    ];
    const adminIds = getIds(adminKeys);

    // --- Role 3: Examiner ---
    // Handles exams and driving tests
    const examinerKeys = [
      'dashboard.view',
      'drivers.view', 'drivers.edit',
      'licenses.view',
      'exams.view', 'exams.create', 'exams.edit',
      'appointments.view', 'appointments.create', 'appointments.edit'
    ];
    const examinerIds = getIds(examinerKeys);

    // --- Role 4: Staff ---
    // General staff with limited read access
    const staffKeys = [
      'dashboard.view',
      'drivers.view',
      'licenses.view',
      'appointments.view'
    ];
    const staffIds = getIds(staffKeys);

    // --- Role 5: Cashier ---
    // Handles payments and revenue
    const cashierKeys = [
      'dashboard.view',
      'drivers.view',
      'licenses.view',
      'payments.view', 'payments.create', 'payments.edit',
      'reports.view'
    ];
    const cashierIds = getIds(cashierKeys);

    // --- Role 6: Driver ---
    // View-only access to their own related data
    const driverKeys = [
      'dashboard.view',
      'drivers.view',
      'licenses.view',
      'exams.view',
      'payments.view',
      'appointments.view'
    ];
    const driverIds = getIds(driverKeys);

    const roleMap = {
      1: { name: 'Super Admin', ids: superAdminIds },
      2: { name: 'Admin', ids: adminIds },
      3: { name: 'Examiner', ids: examinerIds },
      4: { name: 'Staff', ids: staffIds },
      5: { name: 'Cashier', ids: cashierIds },
      6: { name: 'Driver', ids: driverIds }
    };

    for (const [roleId, data] of Object.entries(roleMap)) {
      // Clear existing
      await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      // Insert new
      for (const pid of data.ids) {
        await connection.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleId, pid]
        );
      }
      console.log(data.name + ' (' + roleId + ') assigned ' + data.ids.length + ' permissions');
    }

    // Ensure users are logically assigned:
    // user 1: Super Admin (role 1) - correct
    // user 3: abdi -> Admin (role 2) - reasonable
    // user 6: Abdinasir Mohamoud -> Examiner (role 3) - correct
    // user 7: ali -> Staff (role 4) - correct

    await connection.commit();
    console.log('All roles updated successfully.');
  } catch (err) {
    await connection.rollback();
    console.error('Role assignment failed:', err);
    throw err;
  } finally {
    connection.release();
  }
}

assignLogicalRoles()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
