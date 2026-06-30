-- Staging table for holidays pulled from a public holiday API (Nager.Date) by
-- the yearly holiday-reminder cron. These are SUGGESTIONS only — they do NOT
-- count toward leave balances, schedules, or the calendar feed until HR
-- approves them, which copies the row into public.holidays and deletes it here.
-- Kept separate from public.holidays precisely so unapproved dates never leak
-- into leave math.

CREATE TABLE IF NOT EXISTS public.holiday_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  name text NOT NULL,
  date date NOT NULL,
  year integer NOT NULL,
  source text NOT NULL DEFAULT 'nager',
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Re-running the cron is idempotent: a country/date/name already staged is
  -- skipped via ON CONFLICT DO NOTHING.
  UNIQUE (country, date, name)
);

CREATE INDEX IF NOT EXISTS idx_holiday_suggestions_country ON public.holiday_suggestions(country);
CREATE INDEX IF NOT EXISTS idx_holiday_suggestions_year ON public.holiday_suggestions(year);

ALTER TABLE public.holiday_suggestions ENABLE ROW LEVEL SECURITY;

-- Only HR admins review suggestions. (The cron inserts via the service-role
-- client, which bypasses RLS, so no insert policy is needed for it.)
DROP POLICY IF EXISTS holiday_suggestions_select_admin ON public.holiday_suggestions;
CREATE POLICY holiday_suggestions_select_admin ON public.holiday_suggestions
  FOR SELECT USING (public.get_user_role() IN ('hr_admin', 'super_admin'));

DROP POLICY IF EXISTS holiday_suggestions_insert_admin ON public.holiday_suggestions;
CREATE POLICY holiday_suggestions_insert_admin ON public.holiday_suggestions
  FOR INSERT WITH CHECK (public.get_user_role() IN ('hr_admin', 'super_admin'));

DROP POLICY IF EXISTS holiday_suggestions_delete_admin ON public.holiday_suggestions;
CREATE POLICY holiday_suggestions_delete_admin ON public.holiday_suggestions
  FOR DELETE USING (public.get_user_role() IN ('hr_admin', 'super_admin'));
