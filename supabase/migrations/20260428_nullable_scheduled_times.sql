-- Allow attendance_logs.scheduled_start/end to be NULL when no schedule
-- is on file for the employee on that date. The sync used to silently fall
-- back to 09:00–18:00, which masked missing-schedule situations.
ALTER TABLE public.attendance_logs ALTER COLUMN scheduled_start DROP NOT NULL;
ALTER TABLE public.attendance_logs ALTER COLUMN scheduled_end DROP NOT NULL;

-- New status for "employee has no schedule entry covering this date".
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'no_schedule';
