-- Acknowledgement and employee-note writes now go through server-side API
-- routes (admin client) that enforce per-action rules:
--   acknowledge:    direct manager OR hr_admin/super_admin, and not the
--                   employee themselves; only when not yet acknowledged.
--   employee_note:  the flag's employee, only while not yet acknowledged.
--
-- The previous RLS update policies were too permissive (employees could
-- self-acknowledge by writing the column directly) and missed managers
-- entirely (the button no-op'd at the doorman). Drop them — reads still
-- flow through the existing flags_read_* policies.

DROP POLICY IF EXISTS flags_update_own ON public.attendance_flags;
DROP POLICY IF EXISTS flags_update_hr ON public.attendance_flags;
