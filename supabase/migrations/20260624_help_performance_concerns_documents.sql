-- Help & Guide content for more areas missing from the guide:
--   Performance & Reviews (Reviews, Peer Requests, KPIs, Kudos, 1-on-1s),
--   Workplace Concerns (incidents + anonymous feedback), and Document Requests.
--
-- Sections are appended after the existing ones; HR can reorder them from the
-- admin UI. Role-specific guidance is called out inside individual Q&As.
-- Run once. (Pairs with 20260623_help_peer_feedback_and_calendar.sql.)

-- ── Performance & Reviews ──
INSERT INTO public.help_articles
  (section_title, section_position, section_role, position, question, answer)
VALUES
  ('Performance & Reviews', 10, NULL, 0,
   $$What's in the Performance section?$$,
   $$Open Performance from the sidebar. It has tabs for your Reviews, Peer Requests, Peer Feedback, KPIs, Kudos, and 1-on-1s. The Overview tab summarizes your current review, recent kudos, and KPIs at a glance.$$),
  ('Performance & Reviews', 10, NULL, 1,
   $$How do performance reviews work?$$,
   $$When HR opens a review cycle, your review appears under Performance → Reviews. You fill in your self review; your manager completes their side (shown side-by-side with your self review and any peer responses). Once submitted, a review can't be edited. Status moves from Not started → Self done → Manager done → Signed off.$$),
  ('Performance & Reviews', 10, NULL, 2,
   $$What are Peer Requests?$$,
   $$Peer Requests (Performance → Peer Requests) are feedback requests tied to a review cycle. If someone asks you to give feedback on a colleague's review, it shows up here for you to complete. During an open cycle with a peer deadline, you can also request peer feedback on your own review and choose the reviewers. For feedback outside a cycle, use Peer Feedback instead.$$),
  ('Performance & Reviews', 10, NULL, 3,
   $$What are KPIs?$$,
   $$Performance → KPIs shows the goals and targets assigned to you for a period, with your progress toward each one. Use the year and quarter filters to switch periods. KPIs are set and managed by HR and managers.$$),
  ('Performance & Reviews', 10, NULL, 4,
   $$What are Kudos?$$,
   $$Kudos are quick recognitions you can give a colleague for great work — look for "Give kudos" on a teammate's Performance page. Kudos you receive appear on your Performance → Kudos tab.$$),
  ('Performance & Reviews', 10, NULL, 5,
   $$What are 1-on-1s?$$,
   $$Performance → 1-on-1s tracks check-in meetings between a manager and their report. Each one has a date, an agenda, shared notes both people can see, and private notes visible only to whoever wrote them. Start one with "New 1-on-1".$$);

-- ── Workplace Concerns ──
INSERT INTO public.help_articles
  (section_title, section_position, section_role, position, question, answer)
VALUES
  ('Workplace Concerns', 11, NULL, 0,
   $$How do I raise a workplace concern?$$,
   $$Go to Concerns in the sidebar. There are two channels: Report an Incident (formal) and Anonymous Feedback. Pick whichever fits your situation.$$),
  ('Workplace Concerns', 11, NULL, 1,
   $$What is an incident report?$$,
   $$"Report an Incident" files a formal report with your name attached so HR can follow up with you. It's confidential to the internal HR team only. You can track its status — New, In review, Resolved, or Dismissed — and see your past reports on the Concerns page.$$),
  ('Workplace Concerns', 11, NULL, 2,
   $$Is anonymous feedback really anonymous?$$,
   $$Yes. "Anonymous Feedback" lets you share a thought, concern, or suggestion without identifying yourself — the system stores no link between you and the message. You pick a category (general, compliment, concern, or suggestion). Because it's anonymous, you won't receive a personal reply.$$),
  ('Workplace Concerns', 11, NULL, 3,
   $$(HR) Where do I review concerns?$$,
   $$HR admins review all incident reports and anonymous feedback on the Concerns admin page (Concerns → HR view). You can update an incident's status and add handler notes.$$);

-- ── Document Requests ──
INSERT INTO public.help_articles
  (section_title, section_position, section_role, position, question, answer)
VALUES
  ('Document Requests', 12, NULL, 0,
   $$How do I request an HR document?$$,
   $$Go to Documents. Choose the document type, set who it should be addressed to, add any details, and submit. HR is notified and will process it.$$),
  ('Document Requests', 12, NULL, 1,
   $$What document types can I request?$$,
   $$A Certificate of Employment, a purpose-of-travel / travel letter (with event details), a leave certificate (with leave dates), a copy of your contract, or anything else via "Other" with a custom name.$$),
  ('Document Requests', 12, NULL, 2,
   $$How do I get my finished document?$$,
   $$When HR processes your request, its status changes to Processed and any HR note or file attachment appears on the request — open the attachment link to download it. You can cancel a request while it's still Pending.$$);
