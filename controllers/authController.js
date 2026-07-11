const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const pool = require('../config/database');
const { validatePasswordStrength, sanitizeInput, generatePasswordResetToken } = require('../utils/security');
const { sendPasswordResetEmail } = require('../utils/emailService');
const { blacklistToken } = require('../utils/tokenBlacklist');
const refreshStore = require('../utils/refreshTokenStore');
const notificationService = require('../services/notificationService');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const JWT_SECRET = process.env.JWT_SECRET || 'dlms11_dev_jwt_secret';

// Cookie helpers for httpOnly access token
const isProduction = process.env.NODE_ENV === 'production';
const ACCESS_COOKIE_NAME = 'access_token';
const ACCESS_COOKIE_MAX_AGE = parseInt(process.env.ACCESS_TOKEN_COOKIE_MAX_AGE_MS || (24 * 60 * 60 * 1000), 10); // default 24h
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE = parseInt(process.env.REFRESH_TOKEN_TTL_MS || (30 * 24 * 60 * 60 * 1000), 10); // default 30 days

const setAccessTokenCookie = (res, token) => {
  res.cookie(ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: ACCESS_COOKIE_MAX_AGE,
    path: '/'
  });
};

const clearAccessTokenCookie = (res) => {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  });
};

const getCookieToken = (req) => {
  const cookieHeader = req.headers?.cookie || '';
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === ACCESS_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
};

// Refresh token cookie helpers
const setRefreshTokenCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE,
    path: '/api/auth'
  });
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth'
  });
};

const getRefreshCookieToken = (req) => {
  const cookieHeader = req.headers?.cookie || '';
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
};

const crypto = require('crypto');

const parseUserAgent = (ua) => {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device_type: 'Unknown' };
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) || /Opera\//.test(ua) ? 'Opera' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS|Macintosh/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iOS/.test(ua) ? 'iOS' : 'Unknown';
  const device_type =
    /Mobi|Android|iPhone|iPad/.test(ua) ? 'Mobile' :
    /Tablet|iPad/.test(ua) ? 'Tablet' : 'Desktop';
  return { browser, os, device_type };
};

const buildSessionData = (req) => {
  const ua = req.get('user-agent') || '';
  const parsed = parseUserAgent(ua);
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || 'unknown';
  return {
    ip_address: req.ip || 'unknown',
    public_ip: ip,
    user_agent: ua,
    browser: parsed.browser,
    os: parsed.os,
    device_type: parsed.device_type,
    language: req.headers['accept-language'] || 'unknown',
    timezone: req.body?.timezone || req.headers['x-timezone'] || 'unknown',
    screen_resolution: req.body?.screen_resolution || req.headers['x-screen-resolution'] || 'unknown',
    session_token: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  };
};

const recordLoginHistory = async ({ userId, req, status = 'success' }) => {
  if (!userId) return;
  try {
    const data = buildSessionData(req);
    await pool.query('INSERT INTO login_history SET ?', {
      user_id: userId,
      login_time: new Date(),
      status,
      ...data,
      device_info: `${data.browser} on ${data.os} (${data.device_type}) [${status}]`,
      is_active: status === 'success' ? 1 : 0
    });
  } catch (error) {
    console.warn('Login history logging skipped:', error.message);
  }
};

const recordUserSession = async ({ userId, req }) => {
  if (!userId) return null;
  try {
    const data = buildSessionData(req);
    await pool.query('INSERT INTO user_sessions SET ?', {
      user_id: userId,
      login_time: new Date(),
      is_active: 1,
      ...data
    });
    return data.session_token;
  } catch (error) {
    console.warn('User session logging skipped:', error.message);
    return null;
  }
};

const closeUserSession = async (req) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || getCookieToken(req);
    if (!token) return;
    const [rows] = await pool.query(
      'SELECT session_token FROM user_sessions WHERE is_active = 1 ORDER BY login_time DESC LIMIT 1'
    );
    if (!rows.length) return;
    const sessionToken = rows[0].session_token;
    await pool.query(
      `UPDATE user_sessions
       SET logout_time = NOW(),
           duration = TIMESTAMPDIFF(SECOND, login_time, NOW()),
           is_active = 0,
           logout_reason = 'manual'
       WHERE session_token = ?`,
      [sessionToken]
    );
    await pool.query(
      `UPDATE login_history
       SET logout_time = NOW(),
           session_duration = TIMESTAMPDIFF(SECOND, login_time, NOW()),
           is_active = 0
       WHERE session_token = ?`,
      [sessionToken]
    );
  } catch (error) {
    console.warn('Close user session skipped:', error.message);
  }
};

const isAccountLocked = (user) => {
  if (!user.lockout_until) return false;
  return new Date(user.lockout_until) > new Date();
};

const incrementFailedAttempts = async (userId) => {
  const [rows] = await pool.query(
    'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE user_id = ?',
    [userId]
  );
  const [updated] = await pool.query('SELECT failed_login_attempts, lockout_until FROM users WHERE user_id = ?', [userId]);
  const user = updated[0];
  if (user && user.failed_login_attempts >= MAX_FAILED_ATTEMPTS) {
    await pool.query('UPDATE users SET lockout_until = ? WHERE user_id = ?', [
      new Date(Date.now() + LOCKOUT_DURATION_MS),
      userId
    ]);
  }
  return user;
};

const resetFailedAttempts = async (userId) => {
  await pool.query(
    'UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, last_login = ? WHERE user_id = ?',
    [new Date(), userId]
  );
};

// Register new user
const register = async (req, res) => {
  try {
    const { full_name, email, password, phone, role_id } = req.body;
    const sanitizedEmail = sanitizeInput(email?.toLowerCase()?.trim());

    if (!full_name || !sanitizedEmail || !password) {
      return res.status(400).json({ message: 'Full name, email, and password are required' });
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({ message: 'Password does not meet requirements', errors: passwordCheck.errors });
    }

    const existingUser = await User.findByEmail(sanitizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      full_name: sanitizeInput(full_name),
      email: sanitizedEmail,
      password: hashedPassword,
      phone: phone ? sanitizeInput(phone) : null,
      role_id: role_id || 6,
      status: 'Active',
      created_at: new Date(),
      password_changed_at: new Date()
    };

    const user = await User.create(userData);
    const userId = user.user_id || user.id;

    const token = jwt.sign(
      { id: userId, email: user.email, role: user.role_id },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h', issuer: 'dlms-api', audience: 'dlms-client' }
    );

    await recordLoginHistory({ userId, req, status: 'success' });

    // Set httpOnly cookies (access + refresh). Keep JSON token for backward compatibility
    setAccessTokenCookie(res, token);
    try {
      const { token: refreshToken } = await refreshStore.issue(userId, req);
      setRefreshTokenCookie(res, refreshToken);
    } catch (e) {
      console.warn('Failed to issue refresh token:', e.message);
    }

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: userId,
        full_name: user.full_name,
        email: user.email,
        role: user.role_id,
        phone: user.phone,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const sanitizedEmail = email?.toLowerCase()?.trim();

    if (!sanitizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findByEmailWithPassword(sanitizedEmail);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const userId = user.user_id || user.id;

    if (isAccountLocked(user)) {
      return res.status(423).json({
        message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.'
      });
    }

    if (!user.status || user.status.toLowerCase() !== 'active') {
      return res.status(403).json({ message: 'Account is not active. Please contact an administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await incrementFailedAttempts(userId);
      await recordLoginHistory({ userId, req, status: 'failed' });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await resetFailedAttempts(userId);
    await recordLoginHistory({ userId, req, status: 'success' });
    await recordUserSession({ userId, req });
    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [userId]);

    const token = jwt.sign(
      { id: userId, email: user.email, role: user.role_id },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h', issuer: 'dlms-api', audience: 'dlms-client' }
    );

    // Set httpOnly cookies (access + refresh). Keep JSON token for backward compatibility
    setAccessTokenCookie(res, token);
    try {
      const { token: refreshToken } = await refreshStore.issue(userId, req);
      setRefreshTokenCookie(res, refreshToken);
    } catch (e) {
      console.warn('Failed to issue refresh token:', e.message);
    }

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: userId,
        full_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        email: user.email,
        role: user.role_id,
        phone: user.phone,
        status: user.status,
        must_change_password: Boolean(user.must_change_password)
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user.user_id || user.id,
        full_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        email: user.email,
        role: user.role_id,
        phone: user.phone,
        status: user.status,
        created_at: user.created_at,
        must_change_password: Boolean(user.must_change_password)
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    const userData = {};

    if (full_name) userData.full_name = sanitizeInput(full_name);
    if (phone) userData.phone = sanitizeInput(phone);

    const user = await User.update(req.user.id, userData);

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.user_id || user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role_id,
        phone: user.phone,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }

    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.isValid) {
      return res.status(400).json({ message: 'New password does not meet requirements', errors: passwordCheck.errors });
    }

    const user = await User.findByIdWithPassword(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isTempChange = Boolean(user.must_change_password);
    if (!isTempChange) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.update(req.user.id, {
      password: hashedPassword,
      password_changed_at: new Date(),
      must_change_password: 0
    });

    notificationService.safeNotify('driver.password_changed', {
      data: { name: req.user?.email || 'User', link: `/dashboard/profile` },
      target: { userId: req.user.id },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'Password changed successfully. Please log in again with your new password.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Request password reset
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const sanitizedEmail = email?.toLowerCase()?.trim();

    if (!sanitizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findByEmail(sanitizedEmail);
    if (!user) {
      // Return success even if user not found (prevents email enumeration)
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
    }

    const { token, hashedToken, expiresAt } = generatePasswordResetToken();
    const userId = user.user_id || user.id;

    await pool.query(
      'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE user_id = ?',
      [hashedToken, expiresAt, userId]
    );

    // Send actual password reset email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
    try {
      await sendPasswordResetEmail(
        sanitizedEmail,
        user.full_name || user.first_name || 'User',
        token,
        frontendUrl
      );
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Still return generic success to prevent email enumeration
    }

    res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset password with token
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.isValid) {
      return res.status(400).json({ message: 'Password does not meet requirements', errors: passwordCheck.errors });
    }

    const { hashToken } = require('../utils/security');
    const hashedToken = hashToken(token);

    const [rows] = await pool.query(
      'SELECT user_id FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW() AND deleted_at IS NULL',
      [hashedToken]
    );

    if (!rows.length) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE users SET password = ?, password_reset_token = NULL, password_reset_expires = NULL, password_changed_at = ? WHERE user_id = ?',
      [hashedPassword, new Date(), rows[0].user_id]
    );

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    // If no header token, try cookie token
    if (!token) {
      token = getCookieToken(req);
    }
    if (token) {
      // Blacklist the token so it cannot be reused
      await blacklistToken(token);
    }
    const rToken = getRefreshCookieToken(req);
    if (rToken) {
      try { await refreshStore.revoke(rToken); } catch {}
    }
    await closeUserSession(req);
    clearAccessTokenCookie(res);
    clearRefreshTokenCookie(res);
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Refresh access token using refresh token rotation
const refresh = async (req, res) => {
  try {
    const oldRefresh = getRefreshCookieToken(req);
    if (!oldRefresh) {
      return res.status(401).json({ message: 'No refresh token' });
    }
    const record = await refreshStore.verify(oldRefresh);
    if (!record) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
    const rotated = await refreshStore.rotate(oldRefresh, record.user_id, req);
    if (!rotated) {
      return res.status(401).json({ message: 'Refresh rotation failed' });
    }
    const userId = record.user_id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    const accessToken = jwt.sign(
      { id: userId, email: user.email, role: user.role_id },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h', issuer: 'dlms-api', audience: 'dlms-client' }
    );
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, rotated.token);
    res.json({ message: 'Token refreshed', token: accessToken });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  refresh
};
