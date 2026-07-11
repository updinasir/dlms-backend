const pool = require('../config/database');
const crypto = require('crypto');

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS token_blacklist (
      token_hash VARCHAR(64) PRIMARY KEY,
      expires_at DATETIME NOT NULL,
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

// Hash token for storage (same as security.js hashToken)
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Add a token to the blacklist
 * @param {string} token - JWT token string
 * @param {number} expiresInSeconds - token expiry in seconds (default: 24h)
 */
const blacklistToken = async (token, expiresInSeconds = 86400) => {
  try {
    await ensureTable();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    await pool.query(
      'INSERT INTO token_blacklist (token_hash, expires_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE expires_at = ?',
      [tokenHash, expiresAt, expiresAt]
    );
    return true;
  } catch (error) {
    console.error('Token blacklist error:', error);
    return false;
  }
};

/**
 * Check if a token is blacklisted
 * @param {string} token - JWT token string
 * @returns {Promise<boolean>}
 */
const isTokenBlacklisted = async (token) => {
  try {
    await ensureTable();
    const tokenHash = hashToken(token);
    const [rows] = await pool.query(
      'SELECT 1 FROM token_blacklist WHERE token_hash = ? AND expires_at > NOW() LIMIT 1',
      [tokenHash]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Token blacklist check error:', error);
    return false;
  }
};

/**
 * Clean up expired tokens from blacklist (run periodically via cron)
 */
const cleanupExpiredTokens = async () => {
  try {
    await ensureTable();
    const [result] = await pool.query(
      'DELETE FROM token_blacklist WHERE expires_at <= NOW()'
    );
    console.log(`Cleaned up ${result.affectedRows} expired blacklisted tokens`);
    return result.affectedRows;
  } catch (error) {
    console.error('Token cleanup error:', error);
    return 0;
  }
};

module.exports = {
  blacklistToken,
  isTokenBlacklisted,
  cleanupExpiredTokens,
  hashToken
};
