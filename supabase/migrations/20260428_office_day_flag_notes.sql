-- Move office-day flag notes out of system_settings (where they polluted
-- the General Settings UI) into their own per-employee table.
CREATE TABLE public.office_day_flag_notes (
  employee_id UUID PRIMARY KEY
    REFERENCES public.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.office_day_flag_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY office_day_flag_notes_read ON public.office_day_flag_notes
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY office_day_flag_notes_write ON public.office_day_flag_notes
  FOR ALL USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE TRIGGER trg_office_day_flag_notes_updated_at
  BEFORE UPDATE ON public.office_day_flag_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Migrate any existing flag_note:<uuid> rows from system_settings.
-- We only copy rows whose suffix is a valid UUID *and* still references an
-- existing user (FK cascade would reject orphans).
INSERT INTO public.office_day_flag_notes (employee_id, note, updated_by, updated_at)
SELECT
  (substr(s.key, length('flag_note:') + 1))::uuid AS employee_id,
  s.value,
  s.updated_by,
  s.updated_at
FROM public.system_settings s
JOIN public.users u
  ON u.id = (substr(s.key, length('flag_note:') + 1))::uuid
WHERE s.key LIKE 'flag_note:%'
ON CONFLICT (employee_id) DO UPDATE
  SET note = EXCLUDED.note,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

-- Drop the legacy rows from system_settings now that they've been migrated.
DELETE FROM public.system_settings WHERE key LIKE 'flag_note:%';
