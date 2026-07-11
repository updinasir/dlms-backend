const pool = require('../config/database');
const { generateSecureToken, hashToken } = require('./security');

const DEFAULT_REFRESH_TTL_MS = parseInt(process.env.REFRESH_TOKEN_TTL_MS || (30 * 24 * 60 * 60 * 1000), 10); // 30 days

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      created_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      replaced_by_hash VARCHAR(128) NULL,
      user_agent VARCHAR(255) NULL,
      ip_address VARCHAR(64) NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function issue(userId, req) {
  await ensureTable();
  const token = generateSecureToken(48);
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(Date.now() + DEFAULT_REFRESH_TTL_MS);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, created_at, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, tokenHash, now, expiresAt, (req && req.get && req.get('user-agent')) || null, (req && req.ip) || null]
  );
  return { token, expiresAt };
}

async function verify(token) {
  await ensureTable();
  const tokenHash = hashToken(token);
  const [rows] = await pool.query(
    'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
    [tokenHash]
  );
  return rows[0] || null;
}

async function rotate(oldToken, userId, req) {
  await ensureTable();
  const oldHash = hashToken(oldToken);
  const [rows] = await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = ? LIMIT 1', [oldHash]);
  const existing = rows[0];
  if (!existing || existing.revoked_at || new Date(existing.expires_at) <= new Date() || (userId && existing.user_id !== userId)) {
    return null;
  }
  const { token: newToken } = await issue(existing.user_id, req);
  const newHash = hashToken(newToken);
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_hash = ? WHERE id = ?', [newHash, existing.id]);
  return { token: newToken };
}

async function revoke(token) {
  await ensureTable();
  const tokenHash = hashToken(token);
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [tokenHash]);
}

async function revokeAllForUser(userId) {
  await ensureTable();
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
}

module.exports = {
  issue,
  verify,
  rotate,
  revoke,
  revokeAllForUser
};
