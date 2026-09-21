-- Let hr_support open /attendance/all read-only.
--
-- The All Attendance table reads straight from the browser with the authed
-- client, so RLS is what decides what it sees. hr_support already has
-- company-wide SELECT on leave_requests and schedule_adjustments
-- (20260916_hr_support_read_team_requests); this adds the three remaining
-- tables the page joins. SELECT-only: DeskTime sync and biometric upload stay
-- with hr_admin (their API routes reject hr_support, and the page hides them).

DROP POLICY IF EXISTS attendance_read_hr_support ON public.attendance_logs;
CREATE POLICY attendance_read_hr_support ON public.attendance_logs
  FOR SELECT USING (public.get_user_role() = 'hr_support');

DROP POLICY IF EXISTS schedules_read_hr_support ON public.schedules;
CREATE POLICY schedules_read_hr_support ON public.schedules
  FOR SELECT USING (public.get_user_role() = 'hr_support');

DROP POLICY IF EXISTS biometric_punches_read_hr_support ON public.biometric_punches;
CREATE POLICY biometric_punches_read_hr_support ON public.biometric_punches
  FOR SELECT USING (public.get_user_role() = 'hr_support');
