-- Earned CTO (Compensatory Time Off) ledger. Unlike plan-based leave (renews
-- yearly), CTO grants are accrued individually — currently from approving a
-- holiday-work request with compensation='cto' — and persist until the
-- employee uses them as an approved CTO leave.
--
-- Computed balance lives in src/lib/reports/leave-balances.ts:
--   remaining = sum(cto_grants.days) - sum(approved leave_requests.cto duration)

CREATE TABLE IF NOT EXISTS public.cto_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  days NUMERIC(5, 2) NOT NULL DEFAULT 1,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES public.users(id),
  source TEXT NOT NULL,            -- e.g. 'holiday_work'
  source_request_id UUID,          -- references the originating request
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One grant per source row — prevents a re-approval from double-crediting.
  UNIQUE (source, source_request_id)
);

CREATE INDEX IF NOT EXISTS idx_cto_grants_employee ON public.cto_grants (employee_id);

ALTER TABLE public.cto_grants ENABLE ROW LEVEL SECURITY;

-- Employees see their own grants; managers see their reports'; HR sees all.
DROP POLICY IF EXISTS cto_grants_select_own ON public.cto_grants;
CREATE POLICY cto_grants_select_own ON public.cto_grants
  FOR SELECT USING (
    employee_id = auth.uid()
    OR employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- Direct writes are admin-only. The trigger below uses SECURITY DEFINER to
-- bypass RLS for the automatic holiday-work grants.
DROP POLICY IF EXISTS cto_grants_insert_admin ON public.cto_grants;
CREATE POLICY cto_grants_insert_admin ON public.cto_grants
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS cto_grants_delete_admin ON public.cto_grants;
CREATE POLICY cto_grants_delete_admin ON public.cto_grants
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- Auto-grant / auto-revoke when a holiday-work request transitions in or out
-- of (status='approved' AND compensation='cto'). Idempotent via ON CONFLICT on
-- the (source, source_request_id) unique key.
CREATE OR REPLACE FUNCTION public.grant_cto_on_holiday_work_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  -- Newly entering the "approved + cto" state: grant 1 day.
  IF NEW.status = 'approved' AND NEW.compensation = 'cto'
     AND (OLD.status IS DISTINCT FROM 'approved' OR OLD.compensation IS DISTINCT FROM 'cto') THEN
    INSERT INTO public.cto_grants
      (employee_id, days, granted_by, source, source_request_id, notes)
    VALUES (
      NEW.employee_id,
      1,
      NEW.reviewed_by,
      'holiday_work',
      NEW.id,
      'Earned from approved holiday work'
    )
    ON CONFLICT (source, source_request_id) DO NOTHING;
  END IF;

  -- Leaving the "approved + cto" state (rejected, cancelled, or comp changed
  -- back to holiday_pay): revoke the matching grant.
  IF (OLD.status = 'approved' AND OLD.compensation = 'cto')
     AND (NEW.status IS DISTINCT FROM 'approved' OR NEW.compensation IS DISTINCT FROM 'cto') THEN
    DELETE FROM public.cto_grants
      WHERE source = 'holiday_work' AND source_request_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_grant_cto_on_holiday_work_approval ON public.holiday_work_requests;
CREATE TRIGGER trg_grant_cto_on_holiday_work_approval
  AFTER UPDATE ON public.holiday_work_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_cto_on_holiday_work_approval();

-- If an approved CTO holiday-work request is deleted outright (employee or
-- admin cancellation), revoke the matching grant. Balance may go negative
-- when the user has already consumed the credit.
CREATE OR REPLACE FUNCTION public.revoke_cto_on_holiday_work_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  IF OLD.status = 'approved' AND OLD.compensation = 'cto' THEN
    DELETE FROM public.cto_grants
      WHERE source = 'holiday_work' AND source_request_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$func$;

DROP TRIGGER IF EXISTS trg_revoke_cto_on_holiday_work_delete ON public.holiday_work_requests;
CREATE TRIGGER trg_revoke_cto_on_holiday_work_delete
  AFTER DELETE ON public.holiday_work_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_cto_on_holiday_work_delete();
