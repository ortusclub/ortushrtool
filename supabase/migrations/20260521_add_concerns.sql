-- "Report a Concern" feature: two completely separate channels.
--   incident_reports     — formal, identified, investigable. HR + reporter can read.
--   anonymous_feedback   — truly anonymous; the row stores NO employee_id.
--
-- Files attached to incident reports live in the 'concern-attachments'
-- storage bucket. RLS on storage.objects restricts reads to HR admins or the
-- reporter who owns the parent incident row.

-- ---------------------------------------------------------------------------
-- 1) Incident reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  incident_date DATE NOT NULL,
  incident_type TEXT NOT NULL
    CHECK (incident_type IN ('harassment', 'safety', 'theft', 'misconduct', 'discrimination', 'other')),
  location TEXT,
  people_involved_user_ids UUID[] NOT NULL DEFAULT '{}',
  -- Free-text for people who can't be picked from the directory (externals, etc.)
  people_involved_other TEXT,
  summary TEXT NOT NULL,
  outcome TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_review', 'resolved', 'dismissed')),
  handled_by UUID REFERENCES public.users(id),
  handled_at TIMESTAMPTZ,
  handler_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_reporter
  ON public.incident_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_status
  ON public.incident_reports (status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created_at
  ON public.incident_reports (created_at DESC);

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incident_reports_select ON public.incident_reports;
CREATE POLICY incident_reports_select ON public.incident_reports
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS incident_reports_insert ON public.incident_reports;
CREATE POLICY incident_reports_insert ON public.incident_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS incident_reports_update_admin ON public.incident_reports;
CREATE POLICY incident_reports_update_admin ON public.incident_reports
  FOR UPDATE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS incident_reports_delete_admin ON public.incident_reports;
CREATE POLICY incident_reports_delete_admin ON public.incident_reports
  FOR DELETE USING (
    public.get_user_role() = 'super_admin'
  );

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_incident_reports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_touch_incident_reports_updated_at ON public.incident_reports;
CREATE TRIGGER trg_touch_incident_reports_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_incident_reports_updated_at();


-- ---------------------------------------------------------------------------
-- 2) Incident report attachments (metadata; file lives in storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_report_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_attachments_report
  ON public.incident_report_attachments (report_id);

ALTER TABLE public.incident_report_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incident_attachments_select ON public.incident_report_attachments;
CREATE POLICY incident_attachments_select ON public.incident_report_attachments
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id = report_id AND r.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS incident_attachments_insert ON public.incident_report_attachments;
CREATE POLICY incident_attachments_insert ON public.incident_report_attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id = report_id AND r.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS incident_attachments_delete_admin ON public.incident_report_attachments;
CREATE POLICY incident_attachments_delete_admin ON public.incident_report_attachments
  FOR DELETE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );


-- ---------------------------------------------------------------------------
-- 3) Anonymous feedback (truly anonymous — no employee link)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anonymous_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'compliment', 'concern', 'suggestion')),
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'archived')),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  handler_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anonymous_feedback_status
  ON public.anonymous_feedback (status);
CREATE INDEX IF NOT EXISTS idx_anonymous_feedback_created_at
  ON public.anonymous_feedback (created_at DESC);

ALTER TABLE public.anonymous_feedback ENABLE ROW LEVEL SECURITY;

-- Submitter is authenticated (so we know it's a real employee) but no link
-- back to them is stored. No one but HR ever reads these rows.
DROP POLICY IF EXISTS anonymous_feedback_insert_any ON public.anonymous_feedback;
CREATE POLICY anonymous_feedback_insert_any ON public.anonymous_feedback
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS anonymous_feedback_select_admin ON public.anonymous_feedback;
CREATE POLICY anonymous_feedback_select_admin ON public.anonymous_feedback
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS anonymous_feedback_update_admin ON public.anonymous_feedback;
CREATE POLICY anonymous_feedback_update_admin ON public.anonymous_feedback
  FOR UPDATE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS anonymous_feedback_delete_admin ON public.anonymous_feedback;
CREATE POLICY anonymous_feedback_delete_admin ON public.anonymous_feedback
  FOR DELETE USING (
    public.get_user_role() = 'super_admin'
  );


-- ---------------------------------------------------------------------------
-- 4) Storage bucket for incident attachments (private)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('concern-attachments', 'concern-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Files are stored under "{report_id}/{filename}". Object name encodes the
-- parent report so we can policy-check ownership purely from the path.
DROP POLICY IF EXISTS concern_attachments_insert ON storage.objects;
CREATE POLICY concern_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'concern-attachments'
    AND EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id::text = split_part(name, '/', 1)
        AND r.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS concern_attachments_select ON storage.objects;
CREATE POLICY concern_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'concern-attachments'
    AND (
      public.get_user_role() IN ('hr_admin', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.incident_reports r
        WHERE r.id::text = split_part(name, '/', 1)
          AND r.reporter_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS concern_attachments_delete ON storage.objects;
CREATE POLICY concern_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'concern-attachments'
    AND public.get_user_role() IN ('hr_admin', 'super_admin')
  );
