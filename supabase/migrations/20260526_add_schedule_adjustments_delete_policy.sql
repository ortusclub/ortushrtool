-- schedule_adjustments was missing a DELETE policy, so the "Cancel Request"
-- button (which does a client-side DELETE) silently failed for employees.
-- Mirrors the policy on overtime_requests and document_requests: employee
-- can delete their own pending row.

DROP POLICY IF EXISTS adjustments_delete_own ON public.schedule_adjustments;
CREATE POLICY adjustments_delete_own ON public.schedule_adjustments
  FOR DELETE USING (
    employee_id = auth.uid() AND status = 'pending'
  );

-- Admins can delete any (for cleanup / cancelling on behalf).
DROP POLICY IF EXISTS adjustments_delete_admin ON public.schedule_adjustments;
CREATE POLICY adjustments_delete_admin ON public.schedule_adjustments
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );
