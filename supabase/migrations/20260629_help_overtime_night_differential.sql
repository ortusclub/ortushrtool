-- Help & Guide: the only fileable request type missing from the guide.
--
-- Schedule Adjustments, Leave, and Holiday Work are already documented (My
-- Schedule / Leave Requests / Holidays & Holiday Work sections). Overtime is
-- the one request on the Schedule Requests page with no Help & Guide coverage,
-- so this adds it — including who can file it (overtime-eligible accounts only)
-- and how night differential is handled (auto-calculated, never a separate
-- request).
--
-- Appended after the existing sections; HR can reorder it next to the other
-- request types from the admin UI. INSERT-only so it never clobbers articles
-- HR has edited. Run once.

-- ── Overtime & Night Differential ──
INSERT INTO public.help_articles
  (section_title, section_position, section_role, position, question, answer)
VALUES
  ('Overtime & Night Differential', 13, NULL, 0,
   $$How do I request overtime?$$,
   $$Go to 'Schedule Requests' and click 'Request Overtime'. Pick the date, enter only your OT hours — not your regular shift — add a reason, and submit for approval. Overnight overtime is supported: the end time can be earlier than the start time (e.g. 23:00 – 02:00) and it's treated as carrying into the next day.$$),
  ('Overtime & Night Differential', 13, NULL, 1,
   $$Why don't I see the Request Overtime option?$$,
   $$The 'Request Overtime' button only shows if HR has flagged your account as overtime-eligible. If overtime isn't enabled for you and you think it should be, reach out to HR.$$),
  ('Overtime & Night Differential', 13, NULL, 2,
   $$What is night differential (ND)?$$,
   $$Night differential is extra pay for hours worked during the night window (22:00–06:00). You don't file a separate request for it — it's calculated automatically from your hours that fall in that window, whether they're part of your scheduled shift or approved overtime. When you file overtime that overlaps the night window, the form shows a heads-up with roughly how many ND hours the request qualifies for.$$);
