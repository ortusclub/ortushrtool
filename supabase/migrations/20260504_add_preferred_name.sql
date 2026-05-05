-- Add preferred_name column to users; default to first_name for existing rows
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_name TEXT;

UPDATE users
SET preferred_name = first_name
WHERE preferred_name IS NULL;
