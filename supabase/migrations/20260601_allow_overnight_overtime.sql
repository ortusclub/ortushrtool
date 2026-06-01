-- Allow overnight OT (end_time < start_time) by dropping the check constraint.
-- The calendar feed handles overnight by advancing the end date by 1 day.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.overtime_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%end_time > start_time%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.overtime_requests DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;
