const crypto = require('crypto');

// Password strength validation
const validatePasswordStrength = (password) => {
  const errors = [];
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Sanitize user input to prevent XSS
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

// Deep sanitize object
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeInput(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
};

// Generate secure random token
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Hash token for storage
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Generate password reset token with expiry
const generatePasswordResetToken = () => {
  const token = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour
  return { token, hashedToken: hashToken(token), expiresAt };
};

// Validate an email address format
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

// Validate a phone number (7-15 digits, optional leading +)
const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  return /^\+?[0-9]{7,15}$/.test(phone.replace(/[\s()-]/g, ''));
};

// Calculate age in whole years from a date of birth
const calculateAge = (dateOfBirth) => {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

// Check if a date is in the future relative to now
const isFutureDate = (date) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return false;
  return d.getTime() > Date.now();
};

// Check if IP is potentially suspicious
const isSuspiciousIp = (ip, recentAttempts = []) => {
  if (recentAttempts.length >= 10) {
    const timeWindow = Date.now() - 3600000; // 1 hour
    const recentInWindow = recentAttempts.filter(a => a.time > timeWindow).length;
    return recentInWindow >= 10;
  }
  return false;
};

module.exports = {
  validatePasswordStrength,
  sanitizeInput,
  sanitizeObject,
  generateSecureToken,
  hashToken,
  generatePasswordResetToken,
  isSuspiciousIp,
  isValidEmail,
  isValidPhone,
  calculateAge,
  isFutureDate
};
