-- Adds 'cancelled' to the leave_status enum so approved upcoming leaves
-- can be soft-cancelled (status flipped) instead of hard-deleted. The
-- enum value must be committed in its own transaction before any
-- policy/query can reference it, so this lives in its own migration
-- ahead of 20260520_switch_to_cancel_approved_upcoming_leave.sql.
ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'cancelled';
