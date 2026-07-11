-- Migration: Remove deprecated traffic violations feature and Police role
-- Drop the traffic_violations table if it exists.

DROP TABLE IF EXISTS traffic_violations;

-- Rename the Police Officer role to Staff
UPDATE roles SET role_name = 'Staff' WHERE role_name = 'Police Officer';
