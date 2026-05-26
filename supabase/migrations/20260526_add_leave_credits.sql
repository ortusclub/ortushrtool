-- Generic per-employee leave credit ledger. Sibling to cto_grants but
-- (1) per-leave-type and (2) admin-granted by hand from /admin/leave-credits.
--
-- Sums into planAllocations[leave_type] in the dashboard, team profile, and
-- the leave-balances report (each adds an "active credit" lookup beside the
-- existing CTO fold-in). Credits with expires_at in the past stop counting.

CREATE TABLE IF NOT EXISTS public.leave_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  days NUMERIC(5, 2) NOT NULL,
  granted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE,              -- nullable; NULL = never expires
  granted_by UUID REFERENCES public.users(id),
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_credits_employee ON public.leave_credits (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_credits_lookup ON public.leave_credits (employee_id, leave_type);

ALTER TABLE public.leave_credits ENABLE ROW LEVEL SECURITY;

-- Same visibility rule as cto_grants: self / direct reports / HR.
DROP POLICY IF EXISTS leave_credits_select_own ON public.leave_credits;
CREATE POLICY leave_credits_select_own ON public.leave_credits
  FOR SELECT USING (
    employee_id = auth.uid()
    OR employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS leave_credits_insert_admin ON public.leave_credits;
CREATE POLICY leave_credits_insert_admin ON public.leave_credits
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS leave_credits_update_admin ON public.leave_credits;
CREATE POLICY leave_credits_update_admin ON public.leave_credits
  FOR UPDATE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS leave_credits_delete_admin ON public.leave_credits;
CREATE POLICY leave_credits_delete_admin ON public.leave_credits
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );
