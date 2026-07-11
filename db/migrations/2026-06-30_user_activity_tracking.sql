-- DLMS Phase C Migration: Enhanced user activity tracking
-- Compatible with MariaDB 10.4+

USE dlms;

-- 1) Enhance users table with additional profile/audit fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS username VARCHAR(50) NULL AFTER employee_id,
  ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL AFTER role_id,
  ADD COLUMN IF NOT EXISTS branch_office VARCHAR(100) NULL AFTER department,
  ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(255) NULL AFTER branch_office,
  ADD COLUMN IF NOT EXISTS last_login DATETIME NULL AFTER status,
  ADD COLUMN IF NOT EXISTS last_password_change DATETIME NULL AFTER failed_login_attempts,
  ADD INDEX IF NOT EXISTS idx_users_employee_id (employee_id),
  ADD INDEX IF NOT EXISTS idx_users_username (username);

-- 2) Enhance login_history with detailed session/device/location data
ALTER TABLE login_history
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NULL AFTER login_time,
  ADD COLUMN IF NOT EXISTS logout_time DATETIME NULL AFTER status,
  ADD COLUMN IF NOT EXISTS session_duration INT NULL AFTER logout_time,
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL AFTER device_info,
  ADD COLUMN IF NOT EXISTS browser VARCHAR(100) NULL AFTER user_agent,
  ADD COLUMN IF NOT EXISTS os VARCHAR(100) NULL AFTER browser,
  ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) NULL AFTER os,
  ADD COLUMN IF NOT EXISTS screen_resolution VARCHAR(50) NULL AFTER device_type,
  ADD COLUMN IF NOT EXISTS language VARCHAR(50) NULL AFTER screen_resolution,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) NULL AFTER language,
  ADD COLUMN IF NOT EXISTS public_ip VARCHAR(64) NULL AFTER ip_address,
  ADD COLUMN IF NOT EXISTS local_ip VARCHAR(64) NULL AFTER public_ip,
  ADD COLUMN IF NOT EXISTS country VARCHAR(100) NULL AFTER local_ip,
  ADD COLUMN IF NOT EXISTS region VARCHAR(100) NULL AFTER country,
  ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL AFTER region,
  ADD COLUMN IF NOT EXISTS isp VARCHAR(255) NULL AFTER city,
  ADD COLUMN IF NOT EXISTS vpn_detected TINYINT(1) DEFAULT 0 AFTER isp,
  ADD COLUMN IF NOT EXISTS proxy_detected TINYINT(1) DEFAULT 0 AFTER vpn_detected,
  ADD COLUMN IF NOT EXISTS session_token VARCHAR(255) NULL AFTER proxy_detected,
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1 AFTER session_token,
  ADD INDEX IF NOT EXISTS idx_login_history_session_token (session_token),
  ADD INDEX IF NOT EXISTS idx_login_history_status (status),
  ADD INDEX IF NOT EXISTS idx_login_history_is_active (is_active);

-- 3) Enhance audit_logs with rich metadata and integrity fields
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS module VARCHAR(100) NULL AFTER action_performed,
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER module,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL AFTER description,
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL AFTER ip_address,
  ADD COLUMN IF NOT EXISTS browser VARCHAR(100) NULL AFTER user_agent,
  ADD COLUMN IF NOT EXISTS os VARCHAR(100) NULL AFTER browser,
  ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) NULL AFTER os,
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(255) NULL AFTER device_type,
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(255) NULL AFTER session_id,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NULL AFTER request_id,
  ADD COLUMN IF NOT EXISTS error_message TEXT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS old_value JSON NULL AFTER error_message,
  ADD COLUMN IF NOT EXISTS new_value JSON NULL AFTER old_value,
  ADD COLUMN IF NOT EXISTS changed_fields JSON NULL AFTER new_value,
  ADD COLUMN IF NOT EXISTS geo_location VARCHAR(255) NULL AFTER changed_fields,
  ADD COLUMN IF NOT EXISTS digital_signature VARCHAR(255) NULL AFTER geo_location,
  ADD INDEX IF NOT EXISTS idx_audit_logs_module (module),
  ADD INDEX IF NOT EXISTS idx_audit_logs_status (status),
  ADD INDEX IF NOT EXISTS idx_audit_logs_session_id (session_id);

-- 4) Dedicated user sessions table for tracking login/logout cycles
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id INT NOT NULL,
  login_time DATETIME NOT NULL,
  logout_time DATETIME NULL,
  duration INT NULL,
  ip_address VARCHAR(64) NULL,
  public_ip VARCHAR(64) NULL,
  local_ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  browser VARCHAR(100) NULL,
  os VARCHAR(100) NULL,
  device_type VARCHAR(50) NULL,
  screen_resolution VARCHAR(50) NULL,
  language VARCHAR(50) NULL,
  timezone VARCHAR(100) NULL,
  country VARCHAR(100) NULL,
  region VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  isp VARCHAR(255) NULL,
  vpn_detected TINYINT(1) DEFAULT 0,
  proxy_detected TINYINT(1) DEFAULT 0,
  login_method VARCHAR(50) NULL,
  is_active TINYINT(1) DEFAULT 1,
  logout_reason VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_sessions_user_id (user_id),
  INDEX idx_user_sessions_login_time (login_time),
  INDEX idx_user_sessions_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
