const {
  validatePasswordStrength,
  sanitizeInput,
  generateSecureToken,
  hashToken,
  isSuspiciousIp
} = require('../utils/security');

describe('Security Utilities', () => {
  describe('validatePasswordStrength', () => {
    it('should accept strong passwords', () => {
      const result = validatePasswordStrength('StrongPass123!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject short passwords', () => {
      const result = validatePasswordStrength('Short1!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('8 characters'))).toBe(true);
    });

    it('should reject passwords without uppercase', () => {
      const result = validatePasswordStrength('lowercase123!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
    });

    it('should reject passwords without lowercase', () => {
      const result = validatePasswordStrength('UPPERCASE123!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
    });

    it('should reject passwords without digits', () => {
      const result = validatePasswordStrength('NoDigits!@#');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('digit'))).toBe(true);
    });

    it('should reject passwords without special characters', () => {
      const result = validatePasswordStrength('NoSpecial123');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('special'))).toBe(true);
    });
  });

  describe('sanitizeInput', () => {
    it('should escape HTML characters', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeInput(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should escape quotes', () => {
      const input = 'onclick="evil()"';
      const result = sanitizeInput(input);
      expect(result).not.toContain('"');
      expect(result).toContain('&quot;');
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate tokens of correct length', () => {
      const token = generateSecureToken(32);
      expect(token).toHaveLength(64); // hex encoding doubles length
      expect(typeof token).toBe('string');
    });

    it('should generate unique tokens', () => {
      const t1 = generateSecureToken(32);
      const t2 = generateSecureToken(32);
      expect(t1).not.toBe(t2);
    });
  });

  describe('hashToken', () => {
    it('should produce consistent hashes', () => {
      const hash1 = hashToken('test-token');
      const hash2 = hashToken('test-token');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('isSuspiciousIp', () => {
    it('should return false for few attempts', () => {
      const result = isSuspiciousIp('192.168.1.1', []);
      expect(result).toBe(false);
    });

    it('should return true for many recent attempts', () => {
      const attempts = Array(12).fill(null).map(() => ({
        time: Date.now() - 1000 // within last hour
      }));
      const result = isSuspiciousIp('192.168.1.1', attempts);
      expect(result).toBe(true);
    });

    it('should return false for old attempts', () => {
      const attempts = Array(12).fill(null).map(() => ({
        time: Date.now() - 7200000 // 2 hours ago
      }));
      const result = isSuspiciousIp('192.168.1.1', attempts);
      expect(result).toBe(false);
    });
  });
});

