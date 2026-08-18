-- Reminder flags for requests left pending too long.
--
-- One row per stale pending request, addressed to the approver (the
-- requester's direct manager). Maintained entirely by the daily
-- /api/cron/pending-request-reminders job:
--   * inserted once a pending request crosses the staleness threshold
--   * days_pending refreshed on each run
--   * DELETED as soon as the underlying request stops being pending
--
-- So the table is derived state, not a log — it only ever holds requests
-- that are still waiting. `acknowledged` lets an approver who is knowingly
-- sitting on a request silence the daily email without deciding it; the row
-- stays (and still shows, muted) until the request is actually resolved.

CREATE TABLE IF NOT EXISTS public.request_reminder_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (
    request_type IN ('leave', 'schedule_adjustment', 'overtime', 'holiday_work')
  ),
  request_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  pending_since TIMESTAMPTZ NOT NULL,
  days_pending INTEGER NOT NULL DEFAULT 0,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.users(id),
  last_emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One flag per request, so a re-run refreshes rather than duplicates.
  UNIQUE (request_type, request_id)
);

CREATE INDEX IF NOT EXISTS idx_request_reminder_flags_manager
  ON public.request_reminder_flags(manager_id);
CREATE INDEX IF NOT EXISTS idx_request_reminder_flags_open
  ON public.request_reminder_flags(manager_id, acknowledged);
CREATE INDEX IF NOT EXISTS idx_request_reminder_flags_employee
  ON public.request_reminder_flags(employee_id);

ALTER TABLE public.request_reminder_flags ENABLE ROW LEVEL SECURITY;

-- Reads: the approver being chased, the employee whose request it is, and HR.
DROP POLICY IF EXISTS request_reminder_flags_read_manager ON public.request_reminder_flags;
CREATE POLICY request_reminder_flags_read_manager ON public.request_reminder_flags
  FOR SELECT USING (manager_id = auth.uid());

DROP POLICY IF EXISTS request_reminder_flags_read_own ON public.request_reminder_flags;
CREATE POLICY request_reminder_flags_read_own ON public.request_reminder_flags
  FOR SELECT USING (employee_id = auth.uid());

DROP POLICY IF EXISTS request_reminder_flags_read_hr ON public.request_reminder_flags;
CREATE POLICY request_reminder_flags_read_hr ON public.request_reminder_flags
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- No INSERT/UPDATE/DELETE policies on purpose: the cron writes with the
-- service role, and acknowledgement goes through
-- /api/request-reminders/[id]/acknowledge, which checks that the caller is
-- the flag's own approver or HR (same shape as attendance-flag acks, see
-- 20260429_flag_writes_via_api.sql).

-- Defaults for the new settings, so the admin toggle renders in a known
-- state. Reminders start OFF — switch on in /admin/settings/emails.
INSERT INTO public.system_settings (key, value)
VALUES
  ('pending_request_reminder_emails_enabled', 'false'),
  ('pending_request_reminder_days', '2')
ON CONFLICT (key) DO NOTHING;
