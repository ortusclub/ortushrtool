-- Let an employee edit their OWN request while it is still pending, for all
-- four request types. Until now UPDATE was limited to the employee's direct
-- manager or HR; owners could cancel but not change a pending request's
-- details (they had to cancel and re-file).
--
-- Each policy is scoped to pending rows, and the WITH CHECK keeps the row
-- owned by the same employee and still pending — so an employee can't approve
-- or reassign their own request by editing status/employee_id.

DROP POLICY IF EXISTS leave_update_own_pending ON public.leave_requests;
CREATE POLICY leave_update_own_pending ON public.leave_requests
  FOR UPDATE USING (employee_id = auth.uid() AND status = 'pending')
  WITH CHECK (employee_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS adjustments_update_own_pending ON public.schedule_adjustments;
CREATE POLICY adjustments_update_own_pending ON public.schedule_adjustments
  FOR UPDATE USING (employee_id = auth.uid() AND status = 'pending')
  WITH CHECK (employee_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS holiday_work_update_own_pending ON public.holiday_work_requests;
CREATE POLICY holiday_work_update_own_pending ON public.holiday_work_requests
  FOR UPDATE USING (employee_id = auth.uid() AND status = 'pending')
  WITH CHECK (employee_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS overtime_update_own_pending ON public.overtime_requests;
CREATE POLICY overtime_update_own_pending ON public.overtime_requests
  FOR UPDATE USING (employee_id = auth.uid() AND status = 'pending')
  WITH CHECK (employee_id = auth.uid() AND status = 'pending');
