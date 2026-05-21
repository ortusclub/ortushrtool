-- Track whether a holiday-work request covers a full day or half day. Drives
-- how many CTO days are auto-granted when compensation='cto' is approved
-- (1.0 vs 0.5). The actual hours worked still live in start_time / end_time.

ALTER TABLE public.holiday_work_requests
  ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT 'full_day'
  CHECK (duration IN ('full_day', 'half_day'));

-- Recreate the auto-grant trigger so it (a) honours NEW.duration for the
-- granted day count and (b) keeps the grant in sync if duration is later
-- changed while the request stays approved+cto.
CREATE OR REPLACE FUNCTION public.grant_cto_on_holiday_work_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  -- Entering "approved + cto": grant 1 day (full) or 0.5 day (half).
  IF NEW.status = 'approved' AND NEW.compensation = 'cto'
     AND (OLD.status IS DISTINCT FROM 'approved'
          OR OLD.compensation IS DISTINCT FROM 'cto') THEN
    INSERT INTO public.cto_grants
      (employee_id, days, granted_by, source, source_request_id, notes)
    VALUES (
      NEW.employee_id,
      CASE WHEN NEW.duration = 'half_day' THEN 0.5 ELSE 1 END,
      NEW.reviewed_by,
      'holiday_work',
      NEW.id,
      'Earned from approved holiday work'
    )
    ON CONFLICT (source, source_request_id) DO NOTHING;
  END IF;

  -- Leaving "approved + cto": revoke the matching grant.
  IF (OLD.status = 'approved' AND OLD.compensation = 'cto')
     AND (NEW.status IS DISTINCT FROM 'approved'
          OR NEW.compensation IS DISTINCT FROM 'cto') THEN
    DELETE FROM public.cto_grants
      WHERE source = 'holiday_work' AND source_request_id = OLD.id;
  END IF;

  -- Still approved+cto but duration flipped (full <-> half): resync the grant.
  IF NEW.status = 'approved' AND NEW.compensation = 'cto'
     AND OLD.status = 'approved' AND OLD.compensation = 'cto'
     AND OLD.duration IS DISTINCT FROM NEW.duration THEN
    UPDATE public.cto_grants
       SET days = CASE WHEN NEW.duration = 'half_day' THEN 0.5 ELSE 1 END
     WHERE source = 'holiday_work' AND source_request_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$func$;
