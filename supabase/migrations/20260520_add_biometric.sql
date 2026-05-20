-- Biometric attendance: lets HR upload office-scanner punches that survive
-- the DeskTime sync. DeskTime keeps providing clock-in/out + active time;
-- biometric is consulted only to determine WHERE the employee was on a
-- given date. The two sources live side-by-side and are never merged.
--
-- Scope: Philippines only (Asia/Manila scanner). Punch times are stored in
-- TIMESTAMPTZ but uploaded as Asia/Manila local time.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS biometric_id INTEGER UNIQUE;

CREATE TABLE IF NOT EXISTS public.biometric_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  punch_time TIMESTAMPTZ NOT NULL,
  source_filename TEXT,
  uploaded_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, punch_time)
);

CREATE INDEX IF NOT EXISTS idx_biometric_punches_employee_date
  ON public.biometric_punches (employee_id, punch_time);

-- RLS: everyone can read their own punches; HR/super admins can read/write all.
ALTER TABLE public.biometric_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY biometric_punches_select_own ON public.biometric_punches
  FOR SELECT USING (
    employee_id = auth.uid()
    OR employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY biometric_punches_insert_admin ON public.biometric_punches
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY biometric_punches_delete_admin ON public.biometric_punches
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );
