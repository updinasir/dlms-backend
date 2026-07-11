const pool = require('../config/database');

class Permission {
  static async findAll() {
    const [rows] = await pool.query(
      'SELECT * FROM permissions ORDER BY module, action'
    );
    return rows;
  }

  static async findByRoleId(roleId) {
    const [rows] = await pool.query(
      `SELECT p.* FROM permissions p
       INNER JOIN role_permissions rp ON p.permission_id = rp.permission_id
       WHERE rp.role_id = ?
       ORDER BY p.module, p.action`,
      [roleId]
    );
    return rows;
  }

  static async setRolePermissions(roleId, permissionIds) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      for (const pid of permissionIds) {
        await connection.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleId, pid]
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  static async hasPermission(roleId, module, action) {
    const [rows] = await pool.query(
      `SELECT 1 FROM role_permissions rp
       INNER JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE rp.role_id = ? AND p.module = ? AND p.action = ?
       LIMIT 1`,
      [roleId, module, action]
    );
    return rows.length > 0;
  }

  static async getUserPermissions(userId) {
    const [rows] = await pool.query(
      `SELECT p.module, p.action FROM permissions p
       INNER JOIN role_permissions rp ON p.permission_id = rp.permission_id
       INNER JOIN users u ON u.role_id = rp.role_id
       WHERE u.user_id = ?`,
      [userId]
    );
    return rows;
  }
}

class Role {
  static async findAll() {
    const [rows] = await pool.query('SELECT * FROM roles ORDER BY role_id');
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM roles WHERE role_id = ?', [id]);
    return rows[0];
  }

  static async create(roleData) {
    const [result] = await pool.query('INSERT INTO roles SET ?', roleData);
    return this.findById(result.insertId);
  }

  static async update(id, roleData) {
    await pool.query('UPDATE roles SET ? WHERE role_id = ?', [roleData, id]);
    return this.findById(id);
  }

  static async delete(id) {
    await pool.query('DELETE FROM roles WHERE role_id = ?', [id]);
  }

  static async findWithPermissions() {
    const [roles] = await pool.query('SELECT * FROM roles ORDER BY role_id');
    const result = [];
    for (const role of roles) {
      const [perms] = await pool.query(
        `SELECT p.permission_id, p.module, p.action, p.label FROM permissions p
         INNER JOIN role_permissions rp ON p.permission_id = rp.permission_id
         WHERE rp.role_id = ?`,
        [role.role_id]
      );
      result.push({ ...role, permissions: perms });
    }
    return result;
  }
}

module.exports = { Permission, Role };
