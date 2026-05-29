-- Admin "file on behalf" via /admin/schedules/[userId] uses the regular
-- supabase-js client (RLS-bound), but the existing INSERT policy on
-- schedule_adjustments only permits employee_id = auth.uid(). So admin
-- inserts for other employees were silently denied. This matches the
-- delete-admin policy added 2026-05-26.

DROP POLICY IF EXISTS adjustments_insert_admin ON public.schedule_adjustments;
CREATE POLICY adjustments_insert_admin ON public.schedule_adjustments
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );
