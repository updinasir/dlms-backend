const jwt = require('jsonwebtoken');
require('dotenv').config();
const pool = require('../config/database');
const { isTokenBlacklisted } = require('../utils/tokenBlacklist');

const JWT_SECRET = process.env.JWT_SECRET || 'dlms11_dev_jwt_secret';

const auth = async (req, res, next) => {
  try {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    // Fallback: read access token from httpOnly cookie if Authorization header missing
    if (!token) {
      const cookieHeader = req.headers?.cookie || '';
      if (cookieHeader) {
        const parts = cookieHeader.split(';');
        for (const part of parts) {
          const [rawName, ...rest] = part.trim().split('=');
          if (rawName === 'access_token') {
            token = decodeURIComponent(rest.join('='));
            break;
          }
        }
      }
    }

    if (!token) {
      return res.status(401).json({ message: 'No authentication token, access denied' });
    }

    // Check if token has been blacklisted (user logged out)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return res.status(401).json({ message: 'Token has been revoked. Please log in again.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Invalidate tokens issued before the last password change
    try {
      const userId = decoded.id;
      if (userId) {
        const [rows] = await pool.query('SELECT password_changed_at FROM users WHERE user_id = ?', [userId]);
        const rec = rows && rows[0];
        if (rec && rec.password_changed_at) {
          const pwdChangedAt = new Date(rec.password_changed_at).getTime();
          const tokenIatMs = (decoded.iat || 0) * 1000;
          if (tokenIatMs < pwdChangedAt) {
            return res.status(401).json({ message: 'Session expired due to password change. Please log in again.' });
          }
        }
      }
    } catch (e) {
      // If lookup fails, proceed without blocking but log for diagnostics
      console.warn('Auth middleware password_changed_at check skipped:', e.message);
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    // Map common role names to role IDs
    const roleMapping = {
      'super_admin': [1], // Super Admin only
      'admin': [1, 2], // Super Admin and Admin
      'examiner': [1, 2, 3], // Super Admin, Admin, Examiner
      'cashier': [1, 2, 5], // Super Admin, Admin, Cashier
      'staff': [1, 2, 3, 4, 5], // All staff roles
      'user': [6], // Driver
      'driver': [6]
    };
    
    const userRole = req.user.role;
    let isAuthorized = false;
    
    // Check if role is directly in the allowed list
    if (roles.includes(userRole)) {
      isAuthorized = true;
    }
    
    // Check if any of the allowed roles map to the user's role ID
    if (!isAuthorized) {
      for (const role of roles) {
        if (roleMapping[role] && roleMapping[role].includes(userRole)) {
          isAuthorized = true;
          break;
        }
      }
    }
    
    if (!isAuthorized) {
      return res.status(403).json({ 
        message: 'Not authorized to access this resource' 
      });
    }
    next();
  };
};

module.exports = { auth, authorize };
