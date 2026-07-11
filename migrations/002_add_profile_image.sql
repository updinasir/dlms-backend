-- Add profile_image column to users table if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500) NULL;
