-- Employees had no way to delete their own pending leave or holiday-work
-- requests. The CancelRequest component does a hard DELETE; without these
-- policies the delete silently fails (RLS denies it).
--
-- schedule_adjustments already has adjustments_delete_own (20260526).
-- overtime_requests already has overtime_delete_own (original migration).

DROP POLICY IF EXISTS leave_delete_own_pending ON public.leave_requests;
CREATE POLICY leave_delete_own_pending ON public.leave_requests
  FOR DELETE USING (
    employee_id = auth.uid() AND status = 'pending'
  );

DROP POLICY IF EXISTS holiday_work_delete_own_pending ON public.holiday_work_requests;
CREATE POLICY holiday_work_delete_own_pending ON public.holiday_work_requests
  FOR DELETE USING (
    employee_id = auth.uid() AND status = 'pending'
  );
