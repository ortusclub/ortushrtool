-- Fold cto_grants into leave_credits so all per-employee credit rows live
-- in one ledger. Pending WOH requests are unaffected — they're not approved
-- yet, so no grant row exists for them. After this runs, future WOH
-- approvals write to leave_credits via the swapped trigger.
--
-- Order matters: add the column + dedup index first, then copy the data,
-- then swap the triggers, then truncate cto_grants so the existing reads
-- (which still hit that table) return zero. A follow-up code change will
-- remove those reads entirely, and a final migration drops the table.

-- 1) Schema extension so leave_credits can carry the WOH back-reference.
ALTER TABLE public.leave_credits
  ADD COLUMN IF NOT EXISTS source_request_id UUID;

-- Partial unique index: only enforce when source_request_id IS NOT NULL,
-- so manually-issued credits (no back-reference) can repeat freely.
CREATE UNIQUE INDEX IF NOT EXISTS leave_credits_source_request_uniq
  ON public.leave_credits (source, source_request_id)
  WHERE source_request_id IS NOT NULL;

-- 2) Copy every existing cto_grants row over. Idempotent — re-running is a no-op.
INSERT INTO public.leave_credits
  (employee_id, leave_type, days, granted_at, expires_at, granted_by, source, source_request_id, notes)
SELECT
  employee_id,
  'cto',
  days,
  granted_at::date,
  NULL,                       -- earned CTO doesn't expire
  granted_by,
  source,
  source_request_id,
  notes
FROM public.cto_grants
ON CONFLICT (source, source_request_id) WHERE source_request_id IS NOT NULL DO NOTHING;

-- 3) Swap the auto-grant trigger to write into leave_credits.
DROP TRIGGER IF EXISTS trg_grant_cto_on_holiday_work_approval ON public.holiday_work_requests;

CREATE OR REPLACE FUNCTION public.grant_cto_credit_on_holiday_work_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_days NUMERIC;
BEGIN
  -- Mirror the day count the prior trigger used (1 for full day, 0.5 for half).
  v_days := CASE WHEN NEW.duration = 'half_day' THEN 0.5 ELSE 1 END;

  -- Newly entering "approved + cto": grant.
  IF NEW.status = 'approved' AND NEW.compensation = 'cto'
     AND (OLD.status IS DISTINCT FROM 'approved' OR OLD.compensation IS DISTINCT FROM 'cto') THEN
    INSERT INTO public.leave_credits
      (employee_id, leave_type, days, granted_at, expires_at, granted_by, source, source_request_id, notes)
    VALUES (
      NEW.employee_id,
      'cto',
      v_days,
      CURRENT_DATE,
      NULL,
      NEW.reviewed_by,
      'holiday_work',
      NEW.id,
      'Earned from approved holiday work'
    )
    ON CONFLICT (source, source_request_id) WHERE source_request_id IS NOT NULL DO NOTHING;
  END IF;

  -- Leaving "approved + cto" (status change or comp change): revoke.
  IF (OLD.status = 'approved' AND OLD.compensation = 'cto')
     AND (NEW.status IS DISTINCT FROM 'approved' OR NEW.compensation IS DISTINCT FROM 'cto') THEN
    DELETE FROM public.leave_credits
      WHERE source = 'holiday_work' AND source_request_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_grant_cto_credit_on_holiday_work_approval
  AFTER UPDATE ON public.holiday_work_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_cto_credit_on_holiday_work_approval();

-- 4) Swap the delete-revoke trigger likewise.
DROP TRIGGER IF EXISTS trg_revoke_cto_on_holiday_work_delete ON public.holiday_work_requests;

CREATE OR REPLACE FUNCTION public.revoke_cto_credit_on_holiday_work_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  IF OLD.status = 'approved' AND OLD.compensation = 'cto' THEN
    DELETE FROM public.leave_credits
      WHERE source = 'holiday_work' AND source_request_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$func$;

CREATE TRIGGER trg_revoke_cto_credit_on_holiday_work_delete
  AFTER DELETE ON public.holiday_work_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_cto_credit_on_holiday_work_delete();

-- 5) Empty out cto_grants so the still-deployed read paths (dashboard,
-- team profile, reports) return zero from this table and only see CTO via
-- the new leave_credits path. Avoids double-counting during the transition.
TRUNCATE public.cto_grants;
