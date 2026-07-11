-- DLMS11 Foreign Key Migration
-- Run this SQL against your database to add referential integrity
-- WARNING: First ensure all orphan records are cleaned, or use ON DELETE SET NULL where appropriate

-- Add created_at / updated_at to drivers if missing
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add deleted_at for soft delete
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Add token_blacklist table for secure logout
CREATE TABLE IF NOT EXISTS token_blacklist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token_hash (token_hash),
  INDEX idx_expires_at (expires_at)
);

-- Add audit log improvements
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_data JSON NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_data JSON NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL;

-- FOREIGN KEYS (add after ensuring data integrity)
-- licenses -> drivers
ALTER TABLE licenses
  ADD CONSTRAINT fk_licenses_driver
  FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- practical_exams -> drivers
ALTER TABLE practical_exams
  ADD CONSTRAINT fk_practical_exams_driver
  FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- theory_exams -> drivers
ALTER TABLE theory_exams
  ADD CONSTRAINT fk_theory_exams_driver
  FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- payments -> drivers
ALTER TABLE payments
  ADD CONSTRAINT fk_payments_driver
  FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
  ON DELETE CASCADE ON UPDATE CASCADE;


-- Add ON DELETE CASCADE to other tables referencing drivers
-- (documents, appointments, notifications — verify table names exist first)

-- If categories table exists, add FK for licenses.category_id
-- ALTER TABLE licenses
--   ADD CONSTRAINT fk_licenses_category
--   FOREIGN KEY (category_id) REFERENCES license_categories(category_id)
--   ON DELETE SET NULL ON UPDATE CASCADE;
