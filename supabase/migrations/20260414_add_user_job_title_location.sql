-- Add job title and location to users
ALTER TABLE public.users
  ADD COLUMN job_title TEXT,
  ADD COLUMN location TEXT;
