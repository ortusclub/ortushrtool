-- Standalone peer-to-peer (P2P) feedback, moderated by HR.
--
-- An employee writes feedback aimed at a department (and optionally a specific
-- person in it). The row lands in an HR-only review queue. HR forwards it to a
-- chosen recipient (the department's manager/head) or dismisses it.
--
-- Anonymity: the author is always recorded so HR can see who wrote it, but the
-- recipient is never given a read path to the row — they only receive an email
-- that omits the author's identity. There is no department-head field in the
-- system, so HR selects the recipient per item at approval time.
--
-- This is independent of the cycle-bound `peer_feedback_requests` table.

CREATE TABLE IF NOT EXISTS public.p2p_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  target_department TEXT NOT NULL,
  -- Optional specific person within the target department.
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'forwarded', 'dismissed')),
  -- Who HR forwarded it to (set when status becomes 'forwarded').
  recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  hr_notes TEXT,
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_p2p_feedback_author
  ON public.p2p_feedback (author_id);
CREATE INDEX IF NOT EXISTS idx_p2p_feedback_status
  ON public.p2p_feedback (status);
CREATE INDEX IF NOT EXISTS idx_p2p_feedback_created_at
  ON public.p2p_feedback (created_at DESC);

ALTER TABLE public.p2p_feedback ENABLE ROW LEVEL SECURITY;

-- The author can read their own submissions; HR can read everything. The
-- recipient deliberately has NO read path here — anonymity is preserved by
-- only ever emailing them.
DROP POLICY IF EXISTS p2p_feedback_select ON public.p2p_feedback;
CREATE POLICY p2p_feedback_select ON public.p2p_feedback
  FOR SELECT USING (
    author_id = auth.uid()
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS p2p_feedback_insert ON public.p2p_feedback;
CREATE POLICY p2p_feedback_insert ON public.p2p_feedback
  FOR INSERT WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS p2p_feedback_update_admin ON public.p2p_feedback;
CREATE POLICY p2p_feedback_update_admin ON public.p2p_feedback
  FOR UPDATE USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

DROP POLICY IF EXISTS p2p_feedback_delete_admin ON public.p2p_feedback;
CREATE POLICY p2p_feedback_delete_admin ON public.p2p_feedback
  FOR DELETE USING (
    public.get_user_role() = 'super_admin'
  );

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_p2p_feedback_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_touch_p2p_feedback_updated_at ON public.p2p_feedback;
CREATE TRIGGER trg_touch_p2p_feedback_updated_at
  BEFORE UPDATE ON public.p2p_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_p2p_feedback_updated_at();
