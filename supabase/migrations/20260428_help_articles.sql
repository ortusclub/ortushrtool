-- Help & Guide content moved from a hardcoded TS constant into a table so
-- HR admins can edit it from the admin UI without a code deploy.
CREATE TABLE public.help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_title TEXT NOT NULL,
  section_position INTEGER NOT NULL DEFAULT 0,
  section_role TEXT NULL CHECK (
    section_role IS NULL OR section_role IN ('manager', 'admin', 'super_admin')
  ),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_articles_section
  ON public.help_articles(section_position, section_title, position);

ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY help_articles_read ON public.help_articles
  FOR SELECT USING (true);

CREATE POLICY help_articles_write ON public.help_articles
  FOR ALL USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE TRIGGER trg_help_articles_updated_at
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed with the existing hardcoded SECTIONS content so day-1 the public page
-- looks identical to before.
INSERT INTO public.help_articles
  (section_title, section_position, section_role, position, question, answer)
VALUES
  -- 0: Getting Started
  ('Getting Started', 0, NULL, 0,
   'How do I log in?',
   $$You can log in with your email and password, or use Google Sign-In if you have an @ortusclub.com email. If you forgot your password, click 'Forgot Password' on the login page and an admin will send you a reset link.$$),
  ('Getting Started', 0, NULL, 1,
   'What do I see on the Dashboard?',
   $$Your dashboard shows: any items needing your attention (pending requests, unacknowledged flags), upcoming team events (birthdays, work anniversaries), your leave balance, upcoming and pending leaves, and who's out this week.$$),

  -- 1: My Schedule
  ('My Schedule', 1, NULL, 0,
   'Where can I see my work schedule?',
   $$Go to 'My Schedule' in the sidebar. You'll see your base weekly schedule (days, times, and office/online location) plus any adjustments, leaves, or holidays for the current week.$$),
  ('My Schedule', 1, NULL, 1,
   'How do I request a schedule change?',
   $$Go to 'Schedule Requests' and click 'Request Adjustment'. Choose the date, enter your new start/end times and location (office or online), provide a reason, and submit. Your manager will review it.$$),
  ('My Schedule', 1, NULL, 2,
   'Can I change from office to online for a day?',
   $$Yes. Submit a schedule adjustment request for that date and change the location to 'Online'. Note: employees need at least 2 office days per week, and managers need 3. You'll see a warning if the change would put you below the minimum.$$),

  -- 2: Leave Requests
  ('Leave Requests', 2, NULL, 0,
   'How do I request leave?',
   $$Go to 'Schedule Requests', click 'Request Leave'. Select the leave type, choose full day or half day, pick your dates, add a reason, and submit. You can see your remaining balance before submitting.$$),
  ('Leave Requests', 2, NULL, 1,
   'What leave types are available?',
   $$Universal types available to everyone: Annual Leave, Birthday Leave, CTO Leave, Trinity Leave, and Anniversary Leave. Additional types that HR can activate for you: Maternity/Paternity Leave, Solo Parent Leave, and Bereavement Leave.$$),
  ('Leave Requests', 2, NULL, 2,
   'How does leave balance work?',
   $$Your leave balance is based on the leave plan assigned to you by HR. It shows the total allocated days minus the days you've used since the last renewal date. The balance resets on the plan's renewal date each year.$$),
  ('Leave Requests', 2, NULL, 3,
   'What is leave proration?',
   $$If you're a new hire, your leave balance is prorated based on how many months are left until the next renewal date. For example, if you start halfway through the year and the plan gives 12 days annually, you'd get about 6 days for your first cycle.$$),
  ('Leave Requests', 2, NULL, 4,
   'What is Anniversary Leave?',
   $$Anniversary Leave is granted on your work anniversary date each year, starting from your 1st anniversary. You won't have any anniversary leave credits before your first work anniversary.$$),
  ('Leave Requests', 2, NULL, 5,
   'Can I take a half day?',
   $$Yes. When requesting leave, select 'Half Day' and choose AM or PM. Half days count as 0.5 days against your balance.$$),
  ('Leave Requests', 2, NULL, 6,
   'Can I cancel a leave request?',
   $$You can cancel any request that is still 'Pending'. Go to 'Schedule Requests' and click 'Cancel' on the request. Once approved or rejected, it cannot be cancelled.$$),

  -- 3: Attendance
  ('Attendance', 3, NULL, 0,
   'How is my attendance tracked?',
   $$Your attendance is synced from DeskTime automatically every 30 minutes. It records your clock-in/clock-out times and compares them to your scheduled hours to determine if you were on time, late, or left early.$$),
  ('Attendance', 3, NULL, 1,
   'Where can I see my attendance?',
   $$Go to 'My Attendance' to see your personal attendance history for the past 30 days, including your status for each day.$$),
  ('Attendance', 3, NULL, 2,
   'What do the attendance statuses mean?',
   $$On Time = clocked in on time and left on time. Late Arrival = clocked in after your scheduled start (plus tolerance). Early Departure = left before your scheduled end. Absent = no clock-in recorded. Working = currently on shift. On Leave = approved leave for the day. Rest Day = not a working day.$$),
  ('Attendance', 3, NULL, 3,
   'What is the tolerance for late arrival?',
   $$There is a configurable tolerance (default 15 minutes). If you clock in within the tolerance window, you're still considered on time.$$),
  ('Attendance', 3, NULL, 4,
   'What are attendance flags?',
   $$Flags are generated automatically when you have a late arrival, early departure, or absence. Your manager can review and acknowledge them. You'll see any unacknowledged flags in your dashboard's 'Needs Attention' section.$$),

  -- 4: Holidays & Holiday Work
  ('Holidays & Holiday Work', 4, NULL, 0,
   'Where can I see upcoming holidays?',
   $$Go to 'Holidays' in the sidebar. You'll see all public holidays relevant to your assigned country (Philippines, Kosovo, Italy, or Dubai).$$),
  ('Holidays & Holiday Work', 4, NULL, 1,
   'Can I work on a holiday?',
   $$Yes. Go to 'Schedule Requests' and click 'Request Holiday Work'. Select the holiday, enter your working hours and location, provide a reason, and submit for approval.$$),

  -- 5: Team Calendar & Directory
  ('Team Calendar & Directory', 5, NULL, 0,
   'How do I see everyone''s schedule?',
   $$Go to 'Team Calendar'. You'll see the full team schedule with a customizable date range. It shows each person's daily schedule, location, leaves, holidays, and adjustments. Use the From/To date pickers to view any period.$$),
  ('Team Calendar & Directory', 5, NULL, 1,
   'What does the red flag mean on Team Calendar?',
   $$A red flag means that person has fewer than the required office days that week (2 for employees, 3 for managers).$$),
  ('Team Calendar & Directory', 5, NULL, 2,
   'How do I find a colleague''s profile?',
   $$Go to 'Team Directory' and search by name, email, or department. Click on anyone to see their profile, schedule, and contact details.$$),

  -- 6: Managing Your Team (manager)
  ('Managing Your Team', 6, 'manager', 0,
   'How do I approve or reject requests?',
   $$Go to 'Schedule Requests'. You'll see all pending requests from your team at the top. Click 'Approve' or 'Reject' on each one. You can add notes explaining your decision.$$),
  ('Managing Your Team', 6, 'manager', 1,
   'How do I view my team''s attendance?',
   $$Go to 'Team Attendance' in the Team section of the sidebar. You'll see attendance records for all your direct reports.$$),
  ('Managing Your Team', 6, 'manager', 2,
   'What are Flags and how do I handle them?',
   $$Go to 'Flags' in the Team section. You'll see attendance compliance flags (late arrivals, early departures, absences) for your direct reports. Review each one and click 'Acknowledge' to mark it as reviewed.$$),
  ('Managing Your Team', 6, 'manager', 3,
   'Can I remind someone I have a pending request?',
   $$Not directly, but employees can use the 'Buzz' feature to send you a reminder email about their pending request.$$),

  -- 7: HR Administration (admin)
  ('HR Administration', 7, 'admin', 0,
   'How do I add new employees?',
   $$Go to Users and click 'Add User'. Fill in their details and optionally set their weekly schedule. You can also bulk import users via CSV using the Import Users section at the top of the page.$$),
  ('HR Administration', 7, 'admin', 1,
   'How do I manage schedules in bulk?',
   $$Go to All Schedules. Use the 'Bulk Schedule Update' section to download everyone's current schedule as a CSV, edit it in a spreadsheet, and re-upload. Set the 'Effective from' date to control when the changes take effect.$$),
  ('HR Administration', 7, 'admin', 2,
   'How do I set up leave plans?',
   $$Go to Leave Plans. Create a plan with a name, set the 'Grant On' type (Custom Date, Hire Date, or Anniversary), configure the renewal date if custom, and set the number of days for each leave type. Then assign the plan to employees.$$),
  ('HR Administration', 7, 'admin', 3,
   'How do I bulk import leaves or schedule adjustments?',
   $$Go to Schedule Requests. As an HR admin, you'll see 'Bulk Leave Import' and 'Bulk Schedule Adjustment' sections at the top. Download the sample CSV, fill in the data, and upload. You can auto-approve them on import.$$),
  ('HR Administration', 7, 'admin', 4,
   'How do I manage holidays?',
   $$Go to Manage Holidays. You can add holidays individually, upload them via CSV, or bulk delete. Each holiday is assigned to a country and can be marked as recurring (annual).$$),
  ('HR Administration', 7, 'admin', 5,
   'Where are the reports?',
   $$Go to Reports. There are three tabs: Attendance (compliance summary), Leave (all leave requests with approval details), and Schedule Changes (office/online switch tracking). All can be exported as CSV.$$),
  ('HR Administration', 7, 'admin', 6,
   'What does the red flag mean on All Schedules?',
   $$It means the employee has fewer than the required weekly office days (2 for employees, 3 for managers). Click the flag to add a reason/exception note.$$),

  -- 8: System Settings (super_admin)
  ('System Settings', 8, 'super_admin', 0,
   'Where are the system settings?',
   $$In the sidebar under Settings, you'll find three sub-pages: General (attendance tolerances, shift cutoff hour), Emails (customize all email templates), and Feature Visibility (toggle 'Coming Soon' for unfinished features).$$),
  ('System Settings', 8, 'super_admin', 1,
   'What is Feature Visibility?',
   $$It lets you hide unfinished pages from non-super-admin users. They'll see a 'Coming Soon' message instead. You can toggle individual pages on or off from Settings > Feature Visibility.$$),
  ('System Settings', 8, 'super_admin', 2,
   'Can I customize the emails the system sends?',
   $$Yes. Go to Settings > Emails. You'll see all email templates grouped by category. Each one has an editable subject line and HTML body with placeholder variables like {{employee_name}}. You can preview changes before saving.$$);
