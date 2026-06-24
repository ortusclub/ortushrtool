-- Help & Guide content for two features missing from the guide:
--   1) Peer Feedback (Performance → Peer Feedback) — a new general section.
--   2) Subscribing the Team Calendar in Google Calendar — added to the
--      existing "Team Calendar & Directory" section.
--
-- Help content normally lives in the help_articles table and is editable from
-- the admin UI; this seed just fills the gap. Run once.

-- 1) New "Peer Feedback" section (visible to everyone; role-specific guidance
--    is called out inside the individual Q&As).
INSERT INTO public.help_articles
  (section_title, section_position, section_role, position, question, answer)
VALUES
  ('Peer Feedback', 9, NULL, 0,
   'What is Peer Feedback?',
   $$Peer Feedback lets you share feedback about a team or a specific colleague at any time — it isn't tied to a review cycle. Find it under Performance → Peer Feedback. Your feedback is anonymous: whoever it reaches never sees your name.$$),
  ('Peer Feedback', 9, NULL, 1,
   'How do I give peer feedback?',
   $$Go to Performance → Peer Feedback. Choose the department your feedback is for, optionally pick a specific person in that department, add a subject and your message, then submit. Your past submissions and their status appear on the same page.$$),
  ('Peer Feedback', 9, NULL, 2,
   'Is my feedback really anonymous?',
   $$Yes. The manager or department head who receives your feedback never sees who wrote it. Only HR can see the author, and only while reviewing it before it's passed on.$$),
  ('Peer Feedback', 9, NULL, 3,
   'What happens after I submit feedback?',
   $$HR reviews every submission first. They either forward it to the relevant manager/department head or dismiss it. You can track the status — New, Forwarded, or Dismissed — under your submissions on the Peer Feedback page.$$),
  ('Peer Feedback', 9, NULL, 4,
   'I''m a manager — where do I see feedback forwarded to me?',
   $$When HR forwards feedback to you, a "View feedback" button appears on the Performance → Peer Feedback page. It opens the feedback sent to you (the author stays anonymous), and you can filter it by date range or by the person the feedback is about. Delivering that feedback to the person is your responsibility.$$),
  ('Peer Feedback', 9, NULL, 5,
   '(HR) How do I review and forward peer feedback?',
   $$HR admins are emailed whenever peer feedback is submitted. Open Performance → Peer Feedback → "Review queue". For each item you'll see the author (HR-only), choose a recipient — it defaults to the department's head — add an optional note, and Forward it, or Dismiss it. Forwarded feedback then shows up on that recipient's "View feedback" page.$$);

-- 2) Google Calendar subscription, appended to the Team Calendar section.
INSERT INTO public.help_articles
  (section_title, section_position, section_role, position, question, answer)
VALUES
  ('Team Calendar & Directory', 5, NULL, 3,
   'Can I subscribe to the team calendar in Google Calendar?',
   $$Yes. On the Team Calendar page, open "Subscribe in Google Calendar" and generate your personal calendar token. For each calendar you want (birthdays, leaves, holidays, schedule adjustments, overtime, and more), pick a scope — just you, your team, your department, or the whole company — and copy the URL. In Google Calendar, choose "Other calendars +" → "From URL", paste the link, and add it. Each subscription becomes its own calendar you can colour-code or hide. Google refreshes subscribed calendars on its own schedule (roughly every 12–24 hours), so updates aren't instant. You can regenerate your token any time to revoke old links.$$);
