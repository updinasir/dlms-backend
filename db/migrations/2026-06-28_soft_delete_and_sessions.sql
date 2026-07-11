-- DLMS Phase B Migration: Add soft-delete columns and session tables
-- Compatible with MariaDB 10.4+

USE dlms;

-- 1) Soft-delete columns (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

-- 2) Session support tables (idempotent)
CREATE TABLE IF NOT EXISTS token_blacklist (
  token_hash VARCHAR(64) PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- 3) No data updates needed; all new columns default to NULL
--    Existing code auto-detects presence of deleted_at and will start using it where supported.
