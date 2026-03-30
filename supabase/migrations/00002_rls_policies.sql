-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- ============ USERS ============

-- Everyone can read their own profile
CREATE POLICY users_read_own ON public.users
  FOR SELECT USING (id = auth.uid());

-- Managers can read their direct reports
CREATE POLICY users_read_reports ON public.users
  FOR SELECT USING (manager_id = auth.uid());

-- HR Admin and Super Admin can read all users
CREATE POLICY users_read_all ON public.users
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- HR Admin can update user details (except role)
CREATE POLICY users_update_hr ON public.users
  FOR UPDATE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- Users can update their own profile (limited fields handled at app level)
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (id = auth.uid());

-- ============ SCHEDULES ============

CREATE POLICY schedules_read_own ON public.schedules
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY schedules_read_reports ON public.schedules
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
  );

CREATE POLICY schedules_read_all ON public.schedules
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY schedules_write_hr ON public.schedules
  FOR ALL USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- ============ SCHEDULE ADJUSTMENTS ============

CREATE POLICY adjustments_read_own ON public.schedule_adjustments
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY adjustments_create_own ON public.schedule_adjustments
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY adjustments_read_reports ON public.schedule_adjustments
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
  );

CREATE POLICY adjustments_update_manager ON public.schedule_adjustments
  FOR UPDATE USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY adjustments_read_all ON public.schedule_adjustments
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- ============ ATTENDANCE LOGS ============

CREATE POLICY attendance_read_own ON public.attendance_logs
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY attendance_read_reports ON public.attendance_logs
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
  );

CREATE POLICY attendance_read_all ON public.attendance_logs
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- Insert only via service role (cron jobs)

-- ============ ATTENDANCE FLAGS ============

CREATE POLICY flags_read_own ON public.attendance_flags
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY flags_update_own ON public.attendance_flags
  FOR UPDATE USING (employee_id = auth.uid());

CREATE POLICY flags_read_reports ON public.attendance_flags
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
  );

CREATE POLICY flags_read_all ON public.attendance_flags
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY flags_update_hr ON public.attendance_flags
  FOR UPDATE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- ============ SYSTEM SETTINGS ============

CREATE POLICY settings_read_all ON public.system_settings
  FOR SELECT USING (true);

CREATE POLICY settings_write_admin ON public.system_settings
  FOR ALL USING (
    public.get_user_role() = 'super_admin'
  );

-- ============ NOTIFICATION LOG ============

CREATE POLICY notifications_read_all ON public.notification_log
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );
