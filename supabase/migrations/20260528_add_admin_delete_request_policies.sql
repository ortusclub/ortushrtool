-- Allow hr_admin / super_admin to delete request rows directly.
-- The CancelRequest UI does a hard DELETE; today that silently fails for
-- admins on leave / holiday-work / overtime because the only DELETE policies
-- on those tables target employees deleting their own pending rows.
--
-- For leave_requests, deletion also fires the existing balance/credit logic
-- through other triggers. For holiday_work_requests, the existing
-- trg_revoke_cto_on_holiday_work_delete trigger already revokes any
-- auto-granted CTO when an approved row is deleted.

DROP POLICY IF EXISTS leave_delete_admin ON public.leave_requests;
CREATE POLICY leave_delete_admin ON public.leave_requests
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS holiday_work_delete_admin ON public.holiday_work_requests;
CREATE POLICY holiday_work_delete_admin ON public.holiday_work_requests
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS overtime_delete_admin ON public.overtime_requests;
CREATE POLICY overtime_delete_admin ON public.overtime_requests
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );
