"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  isManager: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface Section {
  title: string;
  role?: "manager" | "admin" | "super_admin";
  items: { q: string; a: string }[];
}

const SECTIONS: Section[] = [
  {
    title: "Getting Started",
    items: [
      {
        q: "How do I log in?",
        a: "You can log in with your email and password, or use Google Sign-In if you have an @ortusclub.com email. If you forgot your password, click 'Forgot Password' on the login page and an admin will send you a reset link.",
      },
      {
        q: "What do I see on the Dashboard?",
        a: "Your dashboard shows: any items needing your attention (pending requests, unacknowledged flags), upcoming team events (birthdays, work anniversaries), your leave balance, upcoming and pending leaves, and who's out this week.",
      },
    ],
  },
  {
    title: "My Schedule",
    items: [
      {
        q: "Where can I see my work schedule?",
        a: "Go to 'My Schedule' in the sidebar. You'll see your base weekly schedule (days, times, and office/online location) plus any adjustments, leaves, or holidays for the current week.",
      },
      {
        q: "How do I request a schedule change?",
        a: "Go to 'Schedule Requests' and click 'Request Adjustment'. Choose the date, enter your new start/end times and location (office or online), provide a reason, and submit. Your manager will review it.",
      },
      {
        q: "Can I change from office to online for a day?",
        a: "Yes. Submit a schedule adjustment request for that date and change the location to 'Online'. Note: employees need at least 2 office days per week, and managers need 3. You'll see a warning if the change would put you below the minimum.",
      },
    ],
  },
  {
    title: "Leave Requests",
    items: [
      {
        q: "How do I request leave?",
        a: "Go to 'Schedule Requests', click 'Request Leave'. Select the leave type, choose full day or half day, pick your dates, add a reason, and submit. You can see your remaining balance before submitting.",
      },
      {
        q: "What leave types are available?",
        a: "Universal types available to everyone: Annual Leave, Birthday Leave, CTO Leave, Trinity Leave, and Anniversary Leave. Additional types that HR can activate for you: Maternity/Paternity Leave, Solo Parent Leave, and Bereavement Leave.",
      },
      {
        q: "How does leave balance work?",
        a: "Your leave balance is based on the leave plan assigned to you by HR. It shows the total allocated days minus the days you've used since the last renewal date. The balance resets on the plan's renewal date each year.",
      },
      {
        q: "What is leave proration?",
        a: "If you're a new hire, your leave balance is prorated based on how many months are left until the next renewal date. For example, if you start halfway through the year and the plan gives 12 days annually, you'd get about 6 days for your first cycle.",
      },
      {
        q: "What is Anniversary Leave?",
        a: "Anniversary Leave is granted on your work anniversary date each year, starting from your 1st anniversary. You won't have any anniversary leave credits before your first work anniversary.",
      },
      {
        q: "Can I take a half day?",
        a: "Yes. When requesting leave, select 'Half Day' and choose AM or PM. Half days count as 0.5 days against your balance.",
      },
      {
        q: "Can I cancel a leave request?",
        a: "You can cancel any request that is still 'Pending'. Go to 'Schedule Requests' and click 'Cancel' on the request. Once approved or rejected, it cannot be cancelled.",
      },
    ],
  },
  {
    title: "Attendance",
    items: [
      {
        q: "How is my attendance tracked?",
        a: "Your attendance is synced from DeskTime automatically every 30 minutes. It records your clock-in/clock-out times and compares them to your scheduled hours to determine if you were on time, late, or left early.",
      },
      {
        q: "Where can I see my attendance?",
        a: "Go to 'My Attendance' to see your personal attendance history for the past 30 days, including your status for each day.",
      },
      {
        q: "What do the attendance statuses mean?",
        a: "On Time = clocked in on time and left on time. Late Arrival = clocked in after your scheduled start (plus tolerance). Early Departure = left before your scheduled end. Absent = no clock-in recorded. Working = currently on shift. On Leave = approved leave for the day. Rest Day = not a working day.",
      },
      {
        q: "What is the tolerance for late arrival?",
        a: "There is a configurable tolerance (default 15 minutes). If you clock in within the tolerance window, you're still considered on time.",
      },
      {
        q: "What are attendance flags?",
        a: "Flags are generated automatically when you have a late arrival, early departure, or absence. Your manager can review and acknowledge them. You'll see any unacknowledged flags in your dashboard's 'Needs Attention' section.",
      },
    ],
  },
  {
    title: "Holidays & Holiday Work",
    items: [
      {
        q: "Where can I see upcoming holidays?",
        a: "Go to 'Holidays' in the sidebar. You'll see all public holidays relevant to your assigned country (Philippines, Kosovo, Italy, or Dubai).",
      },
      {
        q: "Can I work on a holiday?",
        a: "Yes. Go to 'Schedule Requests' and click 'Request Holiday Work'. Select the holiday, enter your working hours and location, provide a reason, and submit for approval.",
      },
    ],
  },
  {
    title: "Team Calendar & Directory",
    items: [
      {
        q: "How do I see everyone's schedule?",
        a: "Go to 'Team Calendar'. You'll see the full team schedule with a customizable date range. It shows each person's daily schedule, location, leaves, holidays, and adjustments. Use the From/To date pickers to view any period.",
      },
      {
        q: "What does the red flag mean on Team Calendar?",
        a: "A red flag means that person has fewer than the required office days that week (2 for employees, 3 for managers).",
      },
      {
        q: "How do I find a colleague's profile?",
        a: "Go to 'Team Directory' and search by name, email, or department. Click on anyone to see their profile, schedule, and contact details.",
      },
    ],
  },
  {
    title: "Managing Your Team",
    role: "manager",
    items: [
      {
        q: "How do I approve or reject requests?",
        a: "Go to 'Schedule Requests'. You'll see all pending requests from your team at the top. Click 'Approve' or 'Reject' on each one. You can add notes explaining your decision.",
      },
      {
        q: "How do I view my team's attendance?",
        a: "Go to 'Team Attendance' in the Team section of the sidebar. You'll see attendance records for all your direct reports.",
      },
      {
        q: "What are Flags and how do I handle them?",
        a: "Go to 'Flags' in the Team section. You'll see attendance compliance flags (late arrivals, early departures, absences) for your direct reports. Review each one and click 'Acknowledge' to mark it as reviewed.",
      },
      {
        q: "Can I remind someone I have a pending request?",
        a: "Not directly, but employees can use the 'Buzz' feature to send you a reminder email about their pending request.",
      },
    ],
  },
  {
    title: "HR Administration",
    role: "admin",
    items: [
      {
        q: "How do I add new employees?",
        a: "Go to Users and click 'Add User'. Fill in their details and optionally set their weekly schedule. You can also bulk import users via CSV using the Import Users section at the top of the page.",
      },
      {
        q: "How do I manage schedules in bulk?",
        a: "Go to All Schedules. Use the 'Bulk Schedule Update' section to download everyone's current schedule as a CSV, edit it in a spreadsheet, and re-upload. Set the 'Effective from' date to control when the changes take effect.",
      },
      {
        q: "How do I set up leave plans?",
        a: "Go to Leave Plans. Create a plan with a name, set the 'Grant On' type (Custom Date, Hire Date, or Anniversary), configure the renewal date if custom, and set the number of days for each leave type. Then assign the plan to employees.",
      },
      {
        q: "How do I bulk import leaves or schedule adjustments?",
        a: "Go to Schedule Requests. As an HR admin, you'll see 'Bulk Leave Import' and 'Bulk Schedule Adjustment' sections at the top. Download the sample CSV, fill in the data, and upload. You can auto-approve them on import.",
      },
      {
        q: "How do I manage holidays?",
        a: "Go to Manage Holidays. You can add holidays individually, upload them via CSV, or bulk delete. Each holiday is assigned to a country and can be marked as recurring (annual).",
      },
      {
        q: "Where are the reports?",
        a: "Go to Reports. There are three tabs: Attendance (compliance summary), Leave (all leave requests with approval details), and Schedule Changes (office/online switch tracking). All can be exported as CSV.",
      },
      {
        q: "What does the red flag mean on All Schedules?",
        a: "It means the employee has fewer than the required weekly office days (2 for employees, 3 for managers). Click the flag to add a reason/exception note.",
      },
    ],
  },
  {
    title: "System Settings",
    role: "super_admin",
    items: [
      {
        q: "Where are the system settings?",
        a: "In the sidebar under Settings, you'll find three sub-pages: General (attendance tolerances, shift cutoff hour), Emails (customize all email templates), and Feature Visibility (toggle 'Coming Soon' for unfinished features).",
      },
      {
        q: "What is Feature Visibility?",
        a: "It lets you hide unfinished pages from non-super-admin users. They'll see a 'Coming Soon' message instead. You can toggle individual pages on or off from Settings > Feature Visibility.",
      },
      {
        q: "Can I customize the emails the system sends?",
        a: "Yes. Go to Settings > Emails. You'll see all email templates grouped by category. Each one has an editable subject line and HTML body with placeholder variables like {{employee_name}}. You can preview changes before saving.",
      },
    ],
  },
];

function Accordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-sm font-medium text-gray-900">{question}</span>
        <ChevronDown
          size={16}
          className={cn(
            "text-gray-400 transition-transform shrink-0 ml-2",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <p className="pb-3 text-sm text-gray-600 leading-relaxed">{answer}</p>
      )}
    </div>
  );
}

export function HelpContent({ isManager, isAdmin, isSuperAdmin }: Props) {
  const visibleSections = SECTIONS.filter((s) => {
    if (!s.role) return true;
    if (s.role === "manager") return isManager;
    if (s.role === "admin") return isAdmin;
    if (s.role === "super_admin") return isSuperAdmin;
    return false;
  });

  const handleDownload = () => {
    let md = "# Ortus Club HR Tool — User Guide\n\n";

    for (const section of visibleSections) {
      md += `## ${section.title}\n\n`;
      for (const item of section.items) {
        md += `### ${item.q}\n${item.a}\n\n`;
      }
    }

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ortus-hr-tool-guide.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={16} />
          Download Guide
        </button>
      </div>

      {visibleSections.map((section) => (
        <div
          key={section.title}
          className="rounded-xl border border-gray-200 bg-white p-6"
        >
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {section.title}
          </h2>
          {section.role && (
            <p className="mb-3 text-xs text-blue-600">
              {section.role === "manager"
                ? "Manager & above"
                : section.role === "admin"
                  ? "HR Admin & above"
                  : "Super Admin only"}
            </p>
          )}
          <div className="divide-y divide-gray-100">
            {section.items.map((item) => (
              <Accordion key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
