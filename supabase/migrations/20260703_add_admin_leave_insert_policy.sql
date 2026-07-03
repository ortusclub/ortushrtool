-- Admin/manager "file leave on behalf" (AdminLeaveForm at /admin/schedules/[userId]
-- and the profile LeaveRequestForm) uses the RLS-bound supabase-js client, but the
-- only INSERT policy on leave_requests is leave_create_own (employee_id = auth.uid()).
-- So inserting leave for ANOTHER employee was denied with "new row violates
-- row-level security policy for table leave_requests". This mirrors the
-- schedule_adjustments admin-insert policy (20260529) and the leave cancel
-- policy's eligibility (self is already covered by leave_create_own; this adds
-- direct managers + hr_admin/super_admin).

DROP POLICY IF EXISTS leave_insert_admin ON public.leave_requests;
CREATE POLICY leave_insert_admin ON public.leave_requests
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('hr_admin', 'super_admin')
    OR employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
  );
