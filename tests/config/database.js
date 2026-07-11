// Mock database pool for testing
const mockQuery = jest.fn();
const mockGetConnection = jest.fn();
const mockBeginTransaction = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();
const mockRelease = jest.fn();

const mockConnection = {
  query: mockQuery,
  beginTransaction: mockBeginTransaction,
  commit: mockCommit,
  rollback: mockRollback,
  release: mockRelease
};

mockGetConnection.mockResolvedValue(mockConnection);

const pool = {
  query: mockQuery,
  getConnection: mockGetConnection
};

module.exports = pool;
