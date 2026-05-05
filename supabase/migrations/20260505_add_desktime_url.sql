-- Add desktime_url column to users; URL to the employee's DeskTime profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS desktime_url TEXT;
