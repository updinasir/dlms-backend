const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock database before requiring modules that use it
const mockQuery = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../config/database', () => ({
  query: mockQuery,
  getConnection: mockGetConnection
}));

// Mock email service
jest.mock('../utils/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true)
}));

// Now require the app components
const authRoutes = require('../routes/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Endpoints', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockGetConnection.mockClear();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      mockQuery
        .mockResolvedValueOnce([[]]) // findByEmail - no existing user
        .mockResolvedValueOnce([{ insertId: 1 }]) // INSERT user
        .mockResolvedValueOnce([[{ user_id: 1, full_name: 'Test User', email: 'test@example.com', role_id: 6, status: 'Active' }]]); // findById

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          full_name: 'Test User',
          email: 'test@example.com',
          password: 'TestPass123!'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        full_name: 'Test User',
        email: 'test@example.com'
      });
      // Ensure password is NOT returned
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          full_name: 'Test User',
          email: 'test@example.com',
          password: 'weak'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.some(e => e.msg.includes('Password'))).toBe(true);
    });

    it('should reject duplicate email registration', async () => {
      mockQuery.mockResolvedValueOnce([[{ user_id: 1, email: 'test@example.com' }]]);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          full_name: 'Test User',
          email: 'test@example.com',
          password: 'TestPass123!'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });

      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('TestPass123!', 10);
      mockQuery
        .mockResolvedValueOnce([[{
          user_id: 1,
          email: 'test@example.com',
          password: hashedPassword,
          full_name: 'Test User',
          role_id: 1,
          status: 'Active',
          lockout_until: null,
          failed_login_attempts: 0
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // reset failed attempts
        .mockResolvedValueOnce([{ insertId: 1 }]); // login history

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPass123!'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({ email: 'test@example.com' });
      // Ensure password hash is NOT returned
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should reject login with invalid password', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPass123!', 10);
      mockQuery
        .mockResolvedValueOnce([[{
          user_id: 1,
          email: 'test@example.com',
          password: hashedPassword,
          role_id: 1,
          status: 'Active',
          lockout_until: null,
          failed_login_attempts: 0
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // increment failed
        .mockResolvedValueOnce([{ insertId: 1 }]); // login history

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPass123!'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toContain('Invalid');
    });

    it('should reject login for inactive accounts', async () => {
      const hashedPassword = await bcrypt.hash('TestPass123!', 10);
      mockQuery.mockResolvedValueOnce([[{
        user_id: 1,
        email: 'test@example.com',
        password: hashedPassword,
        role_id: 1,
        status: 'Inactive',
        lockout_until: null
      }]]);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPass123!'
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('not active');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return generic message even for non-existent email', async () => {
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('If an account exists');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should blacklist token on logout', async () => {
      // Create a valid token for testing
      const token = jwt.sign({ id: 1, role: 1 }, process.env.JWT_SECRET);

      mockQuery.mockResolvedValueOnce([[]]); // token blacklist check

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Logout successful');
      // Verify blacklist insert was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO token_blacklist'),
        expect.any(Array)
      );
    });
  });
});
