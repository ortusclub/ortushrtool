-- Peer (P2P) feedback: let HR forward one submission to MULTIPLE recipients.
--
-- Previously a submission had a single recipient_user_id. We add a
-- recipient_user_ids array (the new source of truth) and backfill it from the
-- existing single column. recipient_user_id is kept in sync with the first
-- element for backward compatibility with any older code paths.
--
-- Array columns can't carry a foreign key, so ids are resolved against
-- public.users at read time; a deleted user simply drops out of the list.

ALTER TABLE public.p2p_feedback
  ADD COLUMN IF NOT EXISTS recipient_user_ids UUID[] NOT NULL DEFAULT '{}';

-- Backfill existing forwarded rows from the single-recipient column.
UPDATE public.p2p_feedback
SET recipient_user_ids = ARRAY[recipient_user_id]
WHERE recipient_user_id IS NOT NULL
  AND cardinality(recipient_user_ids) = 0;

-- Speed up "forwarded to me" lookups (array containment).
CREATE INDEX IF NOT EXISTS idx_p2p_feedback_recipient_ids
  ON public.p2p_feedback USING GIN (recipient_user_ids);
