-- Add birthday, hire_date, and end_date to users for upcoming events tracking
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS end_date DATE;
