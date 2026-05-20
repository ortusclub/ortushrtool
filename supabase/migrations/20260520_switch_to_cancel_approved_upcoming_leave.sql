-- Swap the hard-delete policy added in 20260430 for a soft-cancel policy.
-- An approved, upcoming leave is "cancelled" by flipping its status to
-- 'cancelled' (added in 20260520_add_cancelled_leave_status.sql), which
-- preserves the audit trail. Eligibility matches the prior policy: the
-- employee themselves, their manager, or any hr_admin / super_admin.
DROP POLICY IF EXISTS leave_delete_approved_upcoming ON public.leave_requests;

CREATE POLICY leave_cancel_approved_upcoming ON public.leave_requests
  FOR UPDATE USING (
    status = 'approved'
    AND start_date >= CURRENT_DATE
    AND (
      employee_id = auth.uid()
      OR employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
      OR public.get_user_role() IN ('hr_admin', 'super_admin')
    )
  )
  WITH CHECK (
    status::text = 'cancelled'
    AND start_date >= CURRENT_DATE
    AND (
      employee_id = auth.uid()
      OR employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
      OR public.get_user_role() IN ('hr_admin', 'super_admin')
    )
  );
