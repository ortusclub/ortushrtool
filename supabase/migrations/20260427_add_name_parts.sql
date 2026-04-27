-- Add first_name, middle_name, last_name columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Populate from existing full_name (best-effort split)
UPDATE users SET
  first_name = split_part(full_name, ' ', 1),
  last_name = CASE
    WHEN array_length(string_to_array(full_name, ' '), 1) > 1
    THEN split_part(full_name, ' ', array_length(string_to_array(full_name, ' '), 1))
    ELSE NULL
  END,
  middle_name = CASE
    WHEN array_length(string_to_array(full_name, ' '), 1) > 2
    THEN array_to_string((string_to_array(full_name, ' '))[2:array_length(string_to_array(full_name, ' '), 1)-1], ' ')
    ELSE NULL
  END
WHERE full_name IS NOT NULL;
