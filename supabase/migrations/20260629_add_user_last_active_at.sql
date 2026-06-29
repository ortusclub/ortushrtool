-- Track the most recent authenticated activity per user so admins can see who
-- is actively using the app (distinct from auth.users.last_sign_in_at, which
-- only moves on a new login). The proxy/middleware calls touch_last_active()
-- on every authenticated request; the DB-side WHERE clause throttles writes
-- so a chatty client cannot generate a write per request.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_active_at
  ON public.users (last_active_at DESC NULLS LAST);

-- SECURITY DEFINER so the caller does not need an UPDATE policy on
-- public.users — the function only ever touches the calling user's row.
CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET last_active_at = now()
  WHERE id = auth.uid()
    AND (last_active_at IS NULL OR last_active_at < now() - interval '1 minute');
$$;

REVOKE ALL ON FUNCTION public.touch_last_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;
