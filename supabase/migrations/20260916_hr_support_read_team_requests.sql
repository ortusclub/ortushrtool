-- Let hr_support SEE company-wide requests without being able to act on them.
--
-- hr_support sits at employee level in the role hierarchy, so until now it
-- could only read its own requests — the Team section on /requests came back
-- empty. These policies give it the same READ reach as hr_admin across the
-- four request types so it can monitor and chase what's pending.
--
-- Deliberately SELECT-only. No UPDATE policy is added, so approve/reject,
-- edit and cancel stay with the employee's own manager and hr_admin. The
-- approval buttons write straight from the browser via the authed client, so
-- RLS — not the UI gate — is what actually withholds those actions here.

DROP POLICY IF EXISTS leave_read_hr_support ON public.leave_requests;
CREATE POLICY leave_read_hr_support ON public.leave_requests
  FOR SELECT USING (public.get_user_role() = 'hr_support');

DROP POLICY IF EXISTS adjustments_read_hr_support ON public.schedule_adjustments;
CREATE POLICY adjustments_read_hr_support ON public.schedule_adjustments
  FOR SELECT USING (public.get_user_role() = 'hr_support');

DROP POLICY IF EXISTS holiday_work_read_hr_support ON public.holiday_work_requests;
CREATE POLICY holiday_work_read_hr_support ON public.holiday_work_requests
  FOR SELECT USING (public.get_user_role() = 'hr_support');

DROP POLICY IF EXISTS overtime_read_hr_support ON public.overtime_requests;
CREATE POLICY overtime_read_hr_support ON public.overtime_requests
  FOR SELECT USING (public.get_user_role() = 'hr_support');
