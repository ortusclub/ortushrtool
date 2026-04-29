-- Split flag notes by author. The existing `notes` column is now the
-- manager's acknowledgement note; `employee_notes` is the explanation
-- left by the flagged employee before/after acknowledgement.
ALTER TABLE public.attendance_flags ADD COLUMN employee_notes TEXT;
