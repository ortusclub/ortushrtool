-- Add work location to schedules
CREATE TYPE work_location AS ENUM ('office', 'online');

ALTER TABLE public.schedules
  ADD COLUMN work_location work_location NOT NULL DEFAULT 'office';

-- Add timezone to users (not everyone is PHT)
ALTER TABLE public.users
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Manila';
