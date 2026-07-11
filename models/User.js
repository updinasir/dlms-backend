const pool = require('../config/database');

// Soft-delete support detection (some deployments may not have deleted_at column)
let SOFT_DELETE_FLAG = { checked: false, supported: false };
const ensureSoftDeleteSupport = async () => {
  if (SOFT_DELETE_FLAG.checked) return SOFT_DELETE_FLAG.supported;
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'deleted_at'");
    SOFT_DELETE_FLAG = { checked: true, supported: cols.length > 0 };
  } catch {
    SOFT_DELETE_FLAG = { checked: true, supported: false };
  }
  return SOFT_DELETE_FLAG.supported;
};

const normalizeStatus = (value) => {
  if (!value) return value;
  const text = String(value).trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : value;
};

const resolveRoleId = (role) => {
  if (role === undefined || role === null || role === '') {
    return undefined;
  }

  if (typeof role === 'number') {
    return role;
  }

  const normalized = String(role).trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const roleMap = {
    admin: 1,
    staff: 3,
    user: 6
  };

  return roleMap[normalized] ?? undefined;
};

const splitFullName = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ')
  };
};

const mapUserRow = (row) => {
  if (!row) return row;

  const fullName = row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim();
  const nameParts = splitFullName(fullName);

  const { password, ...safeRow } = row;
  return {
    ...safeRow,
    id: safeRow.user_id,
    user_id: safeRow.user_id,
    full_name: fullName,
    first_name: safeRow.first_name || nameParts.first_name,
    last_name: safeRow.last_name || nameParts.last_name,
    role: safeRow.role_id,
    role_id: safeRow.role_id,
    address: safeRow.address || null
  };
};

const sanitizeUserData = (userData = {}) => {
  const payload = {};

  if (userData.full_name || userData.first_name || userData.last_name) {
    payload.full_name = String(
      userData.full_name || `${userData.first_name || ''} ${userData.last_name || ''}`
    ).trim();
  }

  if (userData.email !== undefined) {
    payload.email = userData.email;
  }

  if (userData.phone !== undefined) {
    payload.phone = userData.phone || null;
  }

  if (userData.password !== undefined) {
    payload.password = userData.password;
  }

  const roleId = resolveRoleId(userData.role_id ?? userData.role);
  if (roleId !== undefined) {
    payload.role_id = roleId;
  }

  if (userData.profile_image !== undefined) {
    payload.profile_image = userData.profile_image || null;
  }

  if (userData.status !== undefined) {
    payload.status = normalizeStatus(userData.status);
  }

  if (userData.password_changed_at !== undefined) {
    payload.password_changed_at = userData.password_changed_at;
  }

  if (userData.must_change_password !== undefined) {
    payload.must_change_password = userData.must_change_password ? 1 : 0;
  }

  if (userData.created_at !== undefined) {
    payload.created_at = userData.created_at;
  }

  return payload;
};

class User {
  static async findAll(filters = {}) {
    const soft = await ensureSoftDeleteSupport();
    let query = `SELECT * FROM users WHERE ${soft ? 'deleted_at IS NULL' : '1=1'}`;
    const params = [];

    if (filters.role) {
      const roleId = resolveRoleId(filters.role) ?? filters.role;
      query += ' AND role_id = ?';
      params.push(roleId);
    }

    if (filters.search) {
      query += ' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      const limit = Math.min(parseInt(filters.limit), 100);
      query += ' LIMIT ?';
      params.push(limit);
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(parseInt(filters.offset));
    }

    const [rows] = await pool.query(query, params);
    return rows.map(mapUserRow);
  }

  static async findById(id) {
    const soft = await ensureSoftDeleteSupport();
    const where = soft ? 'user_id = ? AND deleted_at IS NULL' : 'user_id = ?';
    const [rows] = await pool.query(`SELECT * FROM users WHERE ${where}`, [id]);
    return mapUserRow(rows[0]);
  }

  static async findByEmail(email) {
    const soft = await ensureSoftDeleteSupport();
    const where = soft ? 'email = ? AND deleted_at IS NULL' : 'email = ?';
    const [rows] = await pool.query(`SELECT * FROM users WHERE ${where}`, [email]);
    return mapUserRow(rows[0]);
  }

  static async findByEmailWithPassword(email) {
    const soft = await ensureSoftDeleteSupport();
    const where = soft ? 'email = ? AND deleted_at IS NULL' : 'email = ?';
    const [rows] = await pool.query(`SELECT * FROM users WHERE ${where}`, [email]);
    return rows[0] || null;
  }

  static async findByIdWithPassword(id) {
    const soft = await ensureSoftDeleteSupport();
    const where = soft ? 'user_id = ? AND deleted_at IS NULL' : 'user_id = ?';
    const [rows] = await pool.query(`SELECT * FROM users WHERE ${where}`, [id]);
    return rows[0] || null;
  }

  static async create(userData) {
    const payload = sanitizeUserData(userData);
    const [result] = await pool.query('INSERT INTO users SET ?', payload);
    return this.findById(result.insertId);
  }

  static async update(id, userData) {
    const payload = sanitizeUserData(userData);
    await pool.query('UPDATE users SET ? WHERE user_id = ?', [payload, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const soft = await ensureSoftDeleteSupport();
    if (soft) {
      await pool.query('UPDATE users SET deleted_at = NOW() WHERE user_id = ?', [id]);
    } else {
      await pool.query('DELETE FROM users WHERE user_id = ?', [id]);
    }
  }

  static async count(filters = {}) {
    const soft = await ensureSoftDeleteSupport();
    let query = `SELECT COUNT(*) as total FROM users WHERE ${soft ? 'deleted_at IS NULL' : '1=1'}`;
    const params = [];

    if (filters.role) {
      const roleId = resolveRoleId(filters.role) ?? filters.role;
      query += ' AND role_id = ?';
      params.push(roleId);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      query += ' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }
}

module.exports = User;
