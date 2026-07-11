// Jest setup file
// Mock environment variables before any module imports
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRE = '1h';
process.env.EMAIL_HOST = 'smtp.gmail.com';
process.env.EMAIL_PORT = '587';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASSWORD = 'testpassword';
process.env.FRONTEND_URL = 'http://localhost:5174';

// Mock console methods to reduce noise during tests
// but keep error logging
const originalError = console.error;
console.error = (...args) => {
  // Filter out expected MySQL connection errors during tests
  if (args[0]?.includes?.('connect')) return;
  originalError(...args);
};
