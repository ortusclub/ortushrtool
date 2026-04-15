-- Add avatar_url to users for profile photos
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
