import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, formatDate, formatTime, displayName } from "@/lib/utils";
import { HOLIDAY_COUNTRY_LABELS } from "@/types/database";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Flag,
  Palmtree,
  UserCircle,
  CalendarHeart,
  Cake,
  BriefcaseBusiness,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { startOfWeek, endOfWeek, addDays, format, parseISO, differenceInYears } from "date-fns";
import { WhosOut } from "@/components/dashboard/whos-out";
import { RecentKudos } from "@/components/dashboard/recent-kudos";
import type { KudosWithUsers } from "@/types/database";
import { UserAvatar } from "@/components/shared/user-avatar";
import { LEAVE_TYPE_LABELS, UNIVERSAL_LEAVE_TYPES, LEAVE_TYPES } from "@/lib/constants";
import { prorateLeave, getRenewalStart, getCycleEnd } from "@/lib/leave-proration";
import { buildHolidaySet } from "@/lib/leave-days";
import { buildLeaveLedger } from "@/lib/leave-ledger";
import {
  REQUEST_KIND_LABELS,
  type PendingRequestKind,
} from "@/lib/requests/pending";
import {
  ReminderFlagsCard,
  type ReminderFlag,
} from "@/components/dashboard/reminder-flags-card";
import type { GrantType } from "@/types/database";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  // Service-role client for the company-wide "Who's Out" read only. RLS on
  // leave_requests limits a user-scoped SELECT to their own rows (+ direct
  // reports, + everything for HR/admins), so non-admins would otherwise see
  // an almost-empty widget. The calendar feed already reads company leave
  // this way; this keeps the homepage consistent. Only the display fields
  // (name, dates, type, avatar) are serialized to the client below.
  const admin = createAdminClient();
  const isReviewer = hasRole(user.role, "manager");
  const isAdmin = hasRole(user.role, "hr_admin");

  // Reviewers (managers + admins) may have direct reports; fetch them so
  // we can scope counts. Admins with reports see BOTH org-wide and team
  // counts. Managers (non-admin) see team only. Employees see own only.
  let managerReportIds: string[] = [];
  if (isReviewer) {
    const { data: reports } = await supabase
      .from("users")
      .select("id")
      .eq("manager_id", user.id)
      .eq("is_active", true);
    managerReportIds = (reports ?? []).map((r) => r.id);
  }
  const showAdminTeamBreakdown = isAdmin && managerReportIds.length > 0;

  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const yearStart = `${now.getFullYear()}-01-01`;
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const nextWeekEnd = format(addDays(parseISO(weekEnd), 7), "yyyy-MM-dd");

  // Helper: a guaranteed-zero count promise — used for team-scoped queries
  // when the current viewer has no direct reports (admins without a team).
  const zeroCount = Promise.resolve({ count: 0 });
  // Build a team-scoped count query for the given table — only used when
  // the viewer is an admin who also has direct reports.
  const teamCount = (table: ReturnType<typeof supabase.from>) =>
    scopedCount(table, {
      isAdmin: false,
      isReviewer: true,
      userId: user.id,
      directReportIds: managerReportIds,
    });

  // --- Fetch all data in parallel ---
  const [
    pendingAdjResult,
    pendingLeaveResult,
    pendingHWResult,
    unflaggedResult,
    pendingAdjTeamResult,
    pendingLeaveTeamResult,
    pendingHWTeamResult,
    unflaggedTeamResult,
    myLeavesThisYear,
    myUpcomingLeaves,
    myPendingLeaves,
    whosOutThisWeek,
    upcomingHolidays,
    myCountryHolidays,
    myActivatedLeaveTypes,
    myAssignedPlans,
    myLeaveCredits,
  ] = await Promise.all([
    // Pending schedule adjustments — scope: admins see org-wide; managers
    // see their direct reports; employees see their own.
    scopedCount(
      supabase.from("schedule_adjustments"),
      { isAdmin, isReviewer, userId: user.id, directReportIds: managerReportIds }
    ).eq("status", "pending"),

    // Pending leave requests
    scopedCount(
      supabase.from("leave_requests"),
      { isAdmin, isReviewer, userId: user.id, directReportIds: managerReportIds }
    ).eq("status", "pending"),

    // Pending holiday work requests
    scopedCount(
      supabase.from("holiday_work_requests"),
      { isAdmin, isReviewer, userId: user.id, directReportIds: managerReportIds }
    ).eq("status", "pending"),

    // Unacknowledged flags
    scopedCount(
      supabase.from("attendance_flags"),
      { isAdmin, isReviewer, userId: user.id, directReportIds: managerReportIds }
    ).eq("acknowledged", false),

    // Team-scoped variants — only meaningful when the viewer is an admin
    // who also manages a team. Otherwise resolve to 0 so the destructure
    // stays positional.
    showAdminTeamBreakdown
      ? teamCount(supabase.from("schedule_adjustments")).eq("status", "pending")
      : zeroCount,
    showAdminTeamBreakdown
      ? teamCount(supabase.from("leave_requests")).eq("status", "pending")
      : zeroCount,
    showAdminTeamBreakdown
      ? teamCount(supabase.from("holiday_work_requests")).eq("status", "pending")
      : zeroCount,
    showAdminTeamBreakdown
      ? teamCount(supabase.from("attendance_flags")).eq("acknowledged", false)
      : zeroCount,

    // My approved leaves (past 2 years to cover any renewal date)
    supabase
      .from("leave_requests")
      .select("leave_type, start_date, end_date, leave_duration")
      .eq("employee_id", user.id)
      .eq("status", "approved")
      .gte("start_date", `${now.getFullYear() - 1}-01-01`),

    // My upcoming approved leaves
    supabase
      .from("leave_requests")
      .select("leave_type, start_date, end_date")
      .eq("employee_id", user.id)
      .eq("status", "approved")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(5),

    // My pending leave requests
    supabase
      .from("leave_requests")
      .select("leave_type, start_date, end_date")
      .eq("employee_id", user.id)
      .eq("status", "pending")
      .order("start_date", { ascending: true })
      .limit(5),

    // Who's out this week (approved leaves overlapping this week). Uses the
    // admin client so RLS doesn't trim this company-wide widget to the
    // viewer's own leaves — see the `admin` client note above.
    admin
      .from("leave_requests")
      .select("employee_id, leave_type, start_date, end_date, leave_duration, half_day_period, half_day_start_time, half_day_end_time, employee:users!leave_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email, manager_id)")
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart),

    // Upcoming holidays (any region, next 7 days)
    supabase
      .from("holidays")
      .select("name, date, country, is_recurring"),

    // Holidays in the viewer's country — used to subtract holiday weekdays
    // from "used" leave counts (a public holiday inside an approved range
    // shouldn't be charged as leave).
    supabase
      .from("holidays")
      .select("date, is_recurring")
      .eq("country", user.holiday_country),

    // My activated special leave types
    supabase
      .from("employee_leave_types")
      .select("leave_type")
      .eq("employee_id", user.id),

    // My assigned leave plans
    supabase
      .from("employee_leave_plans")
      .select("plan_id")
      .eq("employee_id", user.id),

    // My leave credits (admin-issued plus auto-granted from approved
    // holiday-work via the trg_grant_cto_credit_on_holiday_work_approval
    // trigger). Filtered to active credits — already granted and not yet
    // expired.
    supabase
      .from("leave_credits")
      .select("leave_type, days, granted_at, expires_at, notes, source")
      .eq("employee_id", user.id)
      .lte("granted_at", today),
  ]);

  // Fetch all users with date fields for upcoming events
  const { data: allUsersForEvents } = await supabase
    .from("users")
    .select(
      "id, full_name, preferred_name, first_name, last_name, email, birthday, hire_date, end_date, avatar_url"
    )
    .eq("is_active", true);

  // Fetch direct report IDs for "My Direct Reports" filter
  const { data: directReports } = isReviewer
    ? await supabase
        .from("users")
        .select("id")
        .eq("manager_id", user.id)
        .eq("is_active", true)
    : { data: [] };

  const directReportIds = new Set((directReports ?? []).map((r) => r.id));

  // "My Team" = my manager + peers (same manager as me) + me
  const myManagerId = user.manager_id;
  const teamMemberIds = new Set<string>();
  if (myManagerId) {
    const { data: teamMembers } = await supabase
      .from("users")
      .select("id")
      .eq("manager_id", myManagerId)
      .eq("is_active", true);
    for (const m of teamMembers ?? []) teamMemberIds.add(m.id);
    teamMemberIds.add(myManagerId);
  }
  teamMemberIds.add(user.id);

  // --- Needs Attention ---
  const pendingAdj = pendingAdjResult.count ?? 0;
  const pendingLeave = pendingLeaveResult.count ?? 0;
  const pendingHW = pendingHWResult.count ?? 0;
  const totalPending = pendingAdj + pendingLeave + pendingHW;
  const unflagged = unflaggedResult.count ?? 0;
  // Team-scoped versions — only populated when showAdminTeamBreakdown.
  const pendingAdjTeam = pendingAdjTeamResult.count ?? 0;
  const pendingLeaveTeam = pendingLeaveTeamResult.count ?? 0;
  const pendingHWTeam = pendingHWTeamResult.count ?? 0;
  const totalPendingTeam = pendingAdjTeam + pendingLeaveTeam + pendingHWTeam;
  const unflaggedTeam = unflaggedTeamResult.count ?? 0;

  // --- Reminder flags: requests this viewer is holding up ---
  // Raised by the pending-request-reminders cron and cleared by it once the
  // request is decided, so anything here is still genuinely waiting. Read
  // through the user client — RLS scopes it to the viewer's own flags (HR
  // sees all, which would be the whole org, so it's narrowed to their own
  // here to keep the card personal).
  const { data: myReminderFlags } = await supabase
    .from("request_reminder_flags")
    .select("id, request_type, employee_id, summary, days_pending")
    .eq("manager_id", user.id)
    .eq("acknowledged", false)
    .order("days_pending", { ascending: false })
    .limit(25);

  const reminderEmployeeIds = Array.from(
    new Set((myReminderFlags ?? []).map((f) => f.employee_id))
  );
  const { data: reminderEmployees } = reminderEmployeeIds.length
    ? await supabase
        .from("users")
        .select("id, full_name, preferred_name, email")
        .in("id", reminderEmployeeIds)
    : { data: [] };
  const reminderEmployeeById = new Map(
    (reminderEmployees ?? []).map((e) => [e.id, e])
  );

  const reminderFlags: ReminderFlag[] = (myReminderFlags ?? []).map((f) => {
    const emp = reminderEmployeeById.get(f.employee_id);
    return {
      id: f.id,
      kindLabel:
        REQUEST_KIND_LABELS[f.request_type as PendingRequestKind] ??
        f.request_type,
      employeeName:
        emp?.full_name || emp?.preferred_name || emp?.email || "An employee",
      summary: f.summary,
      daysPending: f.days_pending,
    };
  });

  const hasAttention =
    totalPending > 0 || unflagged > 0 || reminderFlags.length > 0;

  // --- Leave Balance ---
  function countWeekdays(start: string, end: string): number {
    let count = 0;
    const s = parseISO(start);
    const e = parseISO(end);
    const current = new Date(s);
    while (current <= e) {
      const dow = current.getDay();
      if (dow >= 1 && dow <= 5) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  const leaveTypeLabels = LEAVE_TYPE_LABELS;
  const myActivatedTypes = (myActivatedLeaveTypes.data ?? []).map((d) => d.leave_type);
  const myLeaveTypes = [...UNIVERSAL_LEAVE_TYPES, ...myActivatedTypes];

  // Fetch allocations from all assigned plans and sum per leave type
  const assignedPlanIds = (myAssignedPlans.data ?? []).map((p) => p.plan_id);
  // Earned CTO (auto-granted from approved holiday-work) is a balance even
  // when the user has no leave plan.
  const hasPlan =
    assignedPlanIds.length > 0 || (myLeaveCredits.data?.length ?? 0) > 0;

  const planAllocations: Record<string, number> = {};
  // Track the renewal start date per leave type (earliest renewal across plans)
  const leaveTypeRenewalStart: Record<string, string> = {};

  if (hasPlan) {
    // Fetch plans with renewal info + their allocations
    const [{ data: assignedPlanDetails }, { data: allAllocations }] = await Promise.all([
      supabase
        .from("leave_plans")
        .select("id, grant_type, renewal_month, renewal_day")
        .in("id", assignedPlanIds),
      supabase
        .from("leave_plan_allocations")
        .select("plan_id, leave_type, days_per_year")
        .in("plan_id", assignedPlanIds),
    ]);

    for (const a of allAllocations ?? []) {
      const plan = (assignedPlanDetails ?? []).find((p) => p.id === a.plan_id);
      const grantType = (plan?.grant_type ?? "custom") as GrantType;
      const { renewalStart, month, day } = getRenewalStart(
        grantType,
        plan?.renewal_month ?? 1,
        plan?.renewal_day ?? 1,
        user.hire_date,
        today
      );

      // Prorate for new hires / anniversary check
      const prorated = prorateLeave(
        a.days_per_year,
        user.hire_date,
        renewalStart,
        month,
        day,
        grantType
      );
      planAllocations[a.leave_type] = (planAllocations[a.leave_type] ?? 0) + prorated;

      // Track the earliest renewal start for this leave type
      if (!leaveTypeRenewalStart[a.leave_type] || renewalStart < leaveTypeRenewalStart[a.leave_type]) {
        leaveTypeRenewalStart[a.leave_type] = renewalStart;
      }
    }
  }

  // Which leave types the viewer has via a credit. The credits themselves are
  // applied by buildLeaveLedger below — this only decides what to render.
  const creditedTypes = new Set(
    (myLeaveCredits.data ?? []).map((c) => c.leave_type)
  );

  // Types to show on the dashboard = universal + per-type activations + any
  // type the employee has via an assigned plan or a leave credit. Without the
  // plan/credit parts, plan-granted types like Solo Parent Leave had a balance
  // computed but were never rendered.
  const displayedLeaveTypes = Array.from(
    new Set([
      ...myLeaveTypes,
      ...Object.keys(planAllocations),
      ...creditedTypes,
    ])
  );

  // Count used days per type, respecting per-type renewal dates. Public
  // holidays in the viewer's country are not charged as leave even when
  // they fall inside an approved range.
  const earliestRenewal = Object.values(leaveTypeRenewalStart).sort()[0] ?? yearStart;
  const holidaySet = buildHolidaySet(
    myCountryHolidays.data ?? [],
    earliestRenewal,
    `${now.getFullYear() + 1}-12-31`
  );

  // One ledger, shared with the profile view and the company report, so all
  // three agree about the same person. Critically it keeps EXPIRED credits and
  // nets them against the leave they paid for — dropping them (as this page
  // used to) left the leave counted with nothing to cover it, so a credit that
  // was granted, used, then expired showed as a negative balance.
  const leaveUsed: Record<string, number> = {};
  const leaveAvailable: Record<string, number> = {};
  for (const key of displayedLeaveTypes) {
    const cycleStart = leaveTypeRenewalStart[key] ?? yearStart;
    const ledger = buildLeaveLedger({
      leaveType: key,
      planBase: planAllocations[key] ?? 0,
      cycleStart,
      cycleEnd: getCycleEnd(cycleStart),
      credits: (myLeaveCredits.data ?? []).filter((c) => c.leave_type === key),
      leaves: myLeavesThisYear.data ?? [],
      holidays: holidaySet,
      today,
    });
    leaveUsed[key] = ledger.usedDays;
    leaveAvailable[key] = ledger.available;
  }

  // --- Who's Out ---
  // Build avatar lookup from allUsersForEvents
  const avatarMap = new Map(
    (allUsersForEvents ?? []).map((u) => [u.id, u.avatar_url as string | null])
  );

  const whosOutLeaves = (whosOutThisWeek.data ?? []).map((l) => {
    const emp = l.employee as unknown as {
      full_name: string;
      preferred_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      manager_id: string | null;
    } | null;
    return {
      employeeId: l.employee_id,
      name: displayName(emp),
      leaveType: l.leave_type,
      startDate: l.start_date,
      endDate: l.end_date,
      managerId: emp?.manager_id ?? null,
      avatarUrl: avatarMap.get(l.employee_id) ?? null,
      leaveDuration: l.leave_duration as "full_day" | "half_day" | null,
      halfDayPeriod: (l.half_day_period as "am" | "pm" | null) ?? null,
      halfDayStartTime: (l.half_day_start_time as string | null) ?? null,
      halfDayEndTime: (l.half_day_end_time as string | null) ?? null,
    };
  });


  // --- Upcoming Holidays (next 30 days, matching the upcoming events window) ---
  const upcomingHolidayWindowEnd = format(addDays(now, 30), "yyyy-MM-dd");
  const upcomingHols: { name: string; date: string; country: string }[] = [];
  for (const h of upcomingHolidays.data ?? []) {
    const hDate = parseISO(h.date);
    let matchDate: Date | null = null;

    if (h.is_recurring) {
      // Try this year's date first; fall back to next year's if it's already
      // passed (so e.g. Jan 1 still shows when viewing in late December).
      const thisYear = new Date(now.getFullYear(), hDate.getMonth(), hDate.getDate());
      const thisYearStr = format(thisYear, "yyyy-MM-dd");
      if (thisYearStr >= today && thisYearStr <= upcomingHolidayWindowEnd) {
        matchDate = thisYear;
      } else {
        const nextYear = new Date(now.getFullYear() + 1, hDate.getMonth(), hDate.getDate());
        const nextYearStr = format(nextYear, "yyyy-MM-dd");
        if (nextYearStr >= today && nextYearStr <= upcomingHolidayWindowEnd) {
          matchDate = nextYear;
        }
      }
    } else if (h.date >= today && h.date <= upcomingHolidayWindowEnd) {
      matchDate = hDate;
    }

    if (matchDate) {
      upcomingHols.push({
        name: h.name,
        date: format(matchDate, "yyyy-MM-dd"),
        country: h.country,
      });
    }
  }

  upcomingHols.sort((a, b) => a.date.localeCompare(b.date));

  // Deduplicate by name+date
  const seenHols = new Set<string>();
  const uniqueHols = upcomingHols.filter((h) => {
    const key = `${h.name}-${h.date}`;
    if (seenHols.has(key)) return false;
    seenHols.add(key);
    return true;
  });

  // --- Recent public kudos (plus any private ones the viewer is part of) ---
  const { data: kudosRows } = await supabase
    .from("kudos")
    .select(
      "*, sender:users!kudos_sender_id_fkey(full_name, preferred_name, first_name, last_name, email), recipient:users!kudos_recipient_id_fkey(full_name, preferred_name, first_name, last_name, email)"
    )
    .order("created_at", { ascending: false })
    .limit(5);
  type RawKudosRow = Omit<KudosWithUsers, "sender" | "recipient"> & {
    sender: Array<{ full_name: string; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string }> | null;
    recipient: Array<{ full_name: string; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string }> | null;
  };
  const recentKudos: KudosWithUsers[] = ((kudosRows ?? []) as unknown as RawKudosRow[]).map(
    (k) => ({
      ...k,
      sender:
        Array.isArray(k.sender) && k.sender.length > 0 ? k.sender[0] : null,
      recipient:
        Array.isArray(k.recipient) && k.recipient.length > 0
          ? k.recipient[0]
          : null,
    })
  );

  // --- Upcoming Events (birthdays, anniversaries, first/last days) ---
  const upcomingEvents: {
    type: "birthday" | "anniversary" | "first_day" | "last_day";
    name: string;
    date: string;
    detail: string;
    userId: string;
    avatarUrl: string | null;
  }[] = [];

  const lookAheadDays = 30;
  const todayDate = parseISO(today);

  for (const u of allUsersForEvents ?? []) {
    const name = displayName(u);

    // Birthday
    if (u.birthday) {
      const bd = parseISO(u.birthday);
      const thisYearBd = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
      const nextYearBd = new Date(now.getFullYear() + 1, bd.getMonth(), bd.getDate());
      const upcoming = thisYearBd >= todayDate ? thisYearBd : nextYearBd;
      const daysAway = Math.round((upcoming.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAway < lookAheadDays) {
        upcomingEvents.push({
          type: "birthday",
          name,
          date: format(upcoming, "yyyy-MM-dd"),
          detail: format(upcoming, "MMM d"),
          userId: u.id,
          avatarUrl: u.avatar_url,
        });
      }
    }

    // Work Anniversary
    if (u.hire_date) {
      const hd = parseISO(u.hire_date);
      const thisYearAnniv = new Date(now.getFullYear(), hd.getMonth(), hd.getDate());
      const nextYearAnniv = new Date(now.getFullYear() + 1, hd.getMonth(), hd.getDate());
      const upcoming = thisYearAnniv >= todayDate ? thisYearAnniv : nextYearAnniv;
      const daysAway = Math.round((upcoming.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      const years = differenceInYears(upcoming, hd);
      if (daysAway < lookAheadDays && years >= 1) {
        upcomingEvents.push({
          type: "anniversary",
          name,
          date: format(upcoming, "yyyy-MM-dd"),
          detail: `${years} year${years !== 1 ? "s" : ""}`,
          userId: u.id,
          avatarUrl: u.avatar_url,
        });
      }
    }

    // First Day (hire_date in the future or today)
    if (u.hire_date) {
      const hd = parseISO(u.hire_date);
      const daysAway = Math.round((hd.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAway >= 0 && daysAway < lookAheadDays) {
        upcomingEvents.push({
          type: "first_day",
          name,
          date: u.hire_date,
          detail: format(hd, "MMM d"),
          userId: u.id,
          avatarUrl: u.avatar_url,
        });
      }
    }

    // Last Day
    if (u.end_date) {
      const ed = parseISO(u.end_date);
      const daysAway = Math.round((ed.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAway >= 0 && daysAway < lookAheadDays) {
        upcomingEvents.push({
          type: "last_day",
          name,
          date: u.end_date,
          detail: format(ed, "MMM d"),
          userId: u.id,
          avatarUrl: u.avatar_url,
        });
      }
    }
  }

  upcomingEvents.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {displayName(user)}
        </h1>
        <p className="text-gray-600">
          Here&apos;s your overview for today.
        </p>
        <Link
          href={`/team/${user.id}`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <UserCircle size={16} />
          View my profile
        </Link>
      </div>

      {/* ===== Needs Attention ===== */}
      {hasAttention && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <AlertTriangle size={16} />
            Needs Attention
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ReminderFlagsCard flags={reminderFlags} />
            {totalPending > 0 && (
              <Link
                href="/requests"
                className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-amber-800">
                      {isReviewer ? "Pending Approvals" : "My Pending Requests"}
                    </p>
                    {showAdminTeamBreakdown ? (
                      <div className="mt-1 space-y-1">
                        <ScopeCount label="Org-wide" value={totalPending} accent="amber" />
                        <ScopeCount label="Your team" value={totalPendingTeam} accent="amber" />
                      </div>
                    ) : (
                      <p className="mt-1 text-3xl font-bold text-amber-900">
                        {totalPending}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-amber-700">
                      {pendingAdj > 0 && <span>{pendingAdj} adjustment{pendingAdj !== 1 ? "s" : ""}</span>}
                      {pendingLeave > 0 && <span>{pendingLeave} leave</span>}
                      {pendingHW > 0 && <span>{pendingHW} holiday work</span>}
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-100 p-3">
                    <ArrowRightLeft className="text-amber-600" size={24} />
                  </div>
                </div>
              </Link>
            )}
            {unflagged > 0 && (
              <Link
                href={isReviewer ? "/flags" : "/flags"}
                className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-red-800">
                      {isReviewer ? "Unacknowledged Flags" : "My Unacknowledged Flags"}
                    </p>
                    {showAdminTeamBreakdown ? (
                      <div className="mt-1 space-y-1">
                        <ScopeCount label="Org-wide" value={unflagged} accent="red" />
                        <ScopeCount label="Your team" value={unflaggedTeam} accent="red" />
                      </div>
                    ) : (
                      <p className="mt-1 text-3xl font-bold text-red-900">
                        {unflagged}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-red-100 p-3">
                    <Flag className="text-red-600" size={24} />
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ===== Upcoming Events ===== */}
      {upcomingEvents.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <CalendarHeart size={16} />
            Upcoming Events
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
              {upcomingEvents.map((event, i) => {
                const daysAway = Math.round(
                  (parseISO(event.date).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                const daysLabel =
                  daysAway === 0
                    ? "Today"
                    : daysAway === 1
                      ? "Tomorrow"
                      : `In ${daysAway} days`;

                const icons = {
                  birthday: <Cake size={10} className="text-pink-500" />,
                  anniversary: <BriefcaseBusiness size={10} className="text-amber-500" />,
                  first_day: <UserPlus size={10} className="text-green-500" />,
                  last_day: <UserMinus size={10} className="text-red-500" />,
                };

                const labels = {
                  birthday: "Birthday",
                  anniversary: `Work Anniversary (${event.detail})`,
                  first_day: "First Day",
                  last_day: "Last Day",
                };

                const bgColors = {
                  birthday: "bg-pink-50",
                  anniversary: "bg-amber-50",
                  first_day: "bg-green-50",
                  last_day: "bg-red-50",
                };

                return (
                  <div key={`${event.type}-${event.userId}-${i}`} className="flex items-center gap-4 px-5 py-3">
                    <div className="relative shrink-0">
                      <UserAvatar name={event.name} avatarUrl={event.avatarUrl} size="md" userId={event.userId} />
                      <div className={`absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full ${bgColors[event.type]} ring-2 ring-white pointer-events-none`}>
                        {icons[event.type]}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/team/${event.userId}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline"
                      >
                        {event.name}
                      </Link>
                      <p className="text-xs text-gray-500">{labels[event.type]}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-700">{format(parseISO(event.date), "MMM d")}</p>
                      <p className={`text-xs ${daysAway === 0 ? "font-semibold text-blue-600" : "text-gray-400"}`}>
                        {daysLabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== Time-Off ===== */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Palmtree size={16} />
          Time-Off
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Leave Balance */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {hasPlan ? "Leave Balance" : "Leave Used This Year"}
            </h3>
            {!hasPlan && (
              <p className="mb-3 text-xs text-amber-600">No leave plan assigned. Contact HR to set up your plan.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {displayedLeaveTypes.map((key) => {
                const label = leaveTypeLabels[key] ?? key;
                const used = leaveUsed[key] ?? 0;
                const available = leaveAvailable[key] ?? 0;

                return (
                  <div key={key} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    {hasPlan ? (
                      <>
                        <p className={`mt-1 text-xl font-bold ${available < 0 ? "text-red-600" : "text-gray-900"}`}>
                          {available}
                          <span className="ml-1 text-xs font-normal text-gray-400">available</span>
                        </p>
                        {used > 0 && (
                          <p className="text-[10px] text-gray-400">{used} used this cycle</p>
                        )}
                        {available < 0 && (
                          <p className="text-[10px] font-medium text-red-500">{Math.abs(available)} unpaid</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xl font-bold text-gray-900">
                        {used}
                        <span className="ml-1 text-xs font-normal text-gray-400">day{used !== 1 ? "s" : ""}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming & Pending Leaves */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              My Leaves
            </h3>
            {(myUpcomingLeaves.data?.length ?? 0) === 0 && (myPendingLeaves.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-400">No upcoming or pending leaves.</p>
            ) : (
              <div className="space-y-2">
                {(myPendingLeaves.data ?? []).map((l, i) => (
                  <div key={`p-${i}`} className="flex items-center justify-between rounded-lg bg-yellow-50 px-3 py-2">
                    <div>
                      <p className="text-sm text-gray-900">
                        {formatDate(l.start_date)} — {formatDate(l.end_date)}
                      </p>
                      <p className="text-xs text-gray-500">{leaveTypeLabels[l.leave_type] ?? l.leave_type}</p>
                    </div>
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                      Pending
                    </span>
                  </div>
                ))}
                {(myUpcomingLeaves.data ?? []).map((l, i) => (
                  <div key={`u-${i}`} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                    <div>
                      <p className="text-sm text-gray-900">
                        {formatDate(l.start_date)} — {formatDate(l.end_date)}
                      </p>
                      <p className="text-xs text-gray-500">{leaveTypeLabels[l.leave_type] ?? l.leave_type}</p>
                    </div>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Approved
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Who's Out ===== */}
      <WhosOut
        leaves={whosOutLeaves}
        weekStartStr={weekStart}
        upcomingHolidays={uniqueHols}
        isReviewer={isReviewer}
        currentUserId={user.id}
        teamMemberIds={[...teamMemberIds]}
        directReportIds={[...directReportIds]}
      />

      <RecentKudos kudos={recentKudos} />
    </div>
  );
}

function ScopeCount({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "amber" | "red";
}) {
  const labelClass = accent === "amber" ? "text-amber-700" : "text-red-700";
  const valueClass = accent === "amber" ? "text-amber-900" : "text-red-900";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-xs ${labelClass}`}>{label}</span>
      <span className={`text-2xl font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

/**
 * Scope a count query by the viewer's role:
 * - admin: org-wide (no employee filter)
 * - manager: filter to their direct reports (returns a guaranteed-zero
 *   query when the manager has no reports, so the dashboard counter
 *   still resolves to 0 instead of leaking org-wide rows)
 * - employee: only their own rows
 */
function scopedCount<T extends { select: (sel: string, opts: { count: "exact"; head: true }) => unknown }>(
  table: T,
  ctx: {
    isAdmin: boolean;
    isReviewer: boolean;
    userId: string;
    directReportIds: string[];
  }
) {
  type Q = ReturnType<T["select"]> & {
    eq: (col: string, val: unknown) => Q;
    in: (col: string, vals: string[]) => Q;
  };
  const q = table.select("id", { count: "exact", head: true }) as Q;
  if (ctx.isAdmin) return q;
  if (ctx.isReviewer) {
    // Manager with no reports → match an impossible employee_id so the count is 0.
    if (ctx.directReportIds.length === 0) return q.eq("employee_id", "__none__");
    return q.in("employee_id", ctx.directReportIds);
  }
  return q.eq("employee_id", ctx.userId);
}
