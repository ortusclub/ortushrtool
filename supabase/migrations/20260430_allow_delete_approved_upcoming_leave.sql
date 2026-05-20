-- Allow deleting approved, upcoming leave requests.
-- Eligible deleters: the employee themselves, the employee's manager,
-- or any hr_admin / super_admin. The status/date predicates are enforced
-- in RLS so a stale UI cannot delete past or non-approved rows.
CREATE POLICY leave_delete_approved_upcoming ON public.leave_requests
  FOR DELETE USING (
    status = 'approved'
    AND start_date >= CURRENT_DATE
    AND (
      employee_id = auth.uid()
      OR employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
      OR public.get_user_role() IN ('hr_admin', 'super_admin')
    )
  );
