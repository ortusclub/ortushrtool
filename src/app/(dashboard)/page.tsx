import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole, formatDate, formatTime } from "@/lib/utils";
import { HOLIDAY_COUNTRY_LABELS } from "@/types/database";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Flag,
  Palmtree,
} from "lucide-react";
import { startOfWeek, endOfWeek, addDays, format, parseISO } from "date-fns";
import { WhosOut } from "@/components/dashboard/whos-out";
import { LEAVE_TYPE_LABELS, UNIVERSAL_LEAVE_TYPES, LEAVE_TYPES } from "@/lib/constants";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isReviewer = hasRole(user.role, "manager");

  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const yearStart = `${now.getFullYear()}-01-01`;
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const nextWeekEnd = format(addDays(parseISO(weekEnd), 7), "yyyy-MM-dd");

  // --- Fetch all data in parallel ---
  const [
    pendingAdjResult,
    pendingLeaveResult,
    pendingHWResult,
    unflaggedResult,
    myLeavesThisYear,
    myUpcomingLeaves,
    myPendingLeaves,
    whosOutThisWeek,
    upcomingHolidays,
    myActivatedLeaveTypes,
    myAssignedPlans,
  ] = await Promise.all([
    // Pending schedule adjustments
    isReviewer
      ? supabase
          .from("schedule_adjustments")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : supabase
          .from("schedule_adjustments")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", user.id)
          .eq("status", "pending"),

    // Pending leave requests
    isReviewer
      ? supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", user.id)
          .eq("status", "pending"),

    // Pending holiday work requests
    isReviewer
      ? supabase
          .from("holiday_work_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : supabase
          .from("holiday_work_requests")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", user.id)
          .eq("status", "pending"),

    // Unacknowledged flags (for managers: their team; for employees: their own)
    isReviewer
      ? supabase
          .from("attendance_flags")
          .select("id", { count: "exact", head: true })
          .eq("acknowledged", false)
      : supabase
          .from("attendance_flags")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", user.id)
          .eq("acknowledged", false),

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

    // Who's out this week (approved leaves overlapping this week)
    supabase
      .from("leave_requests")
      .select("employee_id, leave_type, start_date, end_date, employee:users!leave_requests_employee_id_fkey(full_name, manager_id)")
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart),

    // Upcoming holidays (any region, next 7 days)
    supabase
      .from("holidays")
      .select("name, date, country, is_recurring"),

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
  ]);

  // Fetch direct report IDs for "My Direct Reports" filter
  const { data: directReports } = isReviewer
    ? await supabase
        .from("users")
        .select("id")
        .eq("manager_id", user.id)
        .eq("is_active", true)
    : { data: [] };

  const directReportIds = new Set((directReports ?? []).map((r) => r.id));

  // "My Team" = people with the same manager as me (peers + me)
  const myManagerId = user.manager_id;
  const teamMemberIds = new Set<string>();
  if (myManagerId) {
    const { data: teamMembers } = await supabase
      .from("users")
      .select("id")
      .eq("manager_id", myManagerId)
      .eq("is_active", true);
    for (const m of teamMembers ?? []) teamMemberIds.add(m.id);
  }
  teamMemberIds.add(user.id);

  // --- Needs Attention ---
  const pendingAdj = pendingAdjResult.count ?? 0;
  const pendingLeave = pendingLeaveResult.count ?? 0;
  const pendingHW = pendingHWResult.count ?? 0;
  const totalPending = pendingAdj + pendingLeave + pendingHW;
  const unflagged = unflaggedResult.count ?? 0;
  const hasAttention = totalPending > 0 || unflagged > 0;

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
  const hasPlan = assignedPlanIds.length > 0;

  const planAllocations: Record<string, number> = {};
  // Track the renewal start date per leave type (earliest renewal across plans)
  const leaveTypeRenewalStart: Record<string, string> = {};

  if (hasPlan) {
    // Fetch plans with renewal info + their allocations
    const [{ data: assignedPlanDetails }, { data: allAllocations }] = await Promise.all([
      supabase
        .from("leave_plans")
        .select("id, renewal_month, renewal_day")
        .in("id", assignedPlanIds),
      supabase
        .from("leave_plan_allocations")
        .select("plan_id, leave_type, days_per_year")
        .in("plan_id", assignedPlanIds),
    ]);

    // Build plan renewal date map
    const planRenewalStart = new Map<string, string>();
    for (const p of assignedPlanDetails ?? []) {
      const month = p.renewal_month ?? 1;
      const day = p.renewal_day ?? 1;
      // Determine the most recent renewal date (this year or last year)
      const thisYearRenewal = `${now.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const lastYearRenewal = `${now.getFullYear() - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const renewalStart = thisYearRenewal <= today ? thisYearRenewal : lastYearRenewal;
      planRenewalStart.set(p.id, renewalStart);
    }

    for (const a of allAllocations ?? []) {
      planAllocations[a.leave_type] = (planAllocations[a.leave_type] ?? 0) + a.days_per_year;

      // Track the earliest renewal start for this leave type
      const planRenewal = planRenewalStart.get(a.plan_id) ?? yearStart;
      if (!leaveTypeRenewalStart[a.leave_type] || planRenewal < leaveTypeRenewalStart[a.leave_type]) {
        leaveTypeRenewalStart[a.leave_type] = planRenewal;
      }
    }
  }

  // Count used days per type, respecting per-type renewal dates
  const leaveUsed: Record<string, number> = {};

  for (const l of myLeavesThisYear.data ?? []) {
    const renewalStart = leaveTypeRenewalStart[l.leave_type] ?? yearStart;
    if (l.start_date >= renewalStart) {
      const days = l.leave_duration === "half_day" ? 0.5 : countWeekdays(l.start_date, l.end_date);
      leaveUsed[l.leave_type] = (leaveUsed[l.leave_type] ?? 0) + days;
    }
  }

  // --- Who's Out ---
  const whosOutLeaves = (whosOutThisWeek.data ?? []).map((l) => {
    const emp = l.employee as unknown as { full_name: string; manager_id: string | null } | null;
    return {
      employeeId: l.employee_id,
      name: emp?.full_name ?? "Unknown",
      leaveType: l.leave_type,
      startDate: l.start_date,
      endDate: l.end_date,
      managerId: emp?.manager_id ?? null,
    };
  });

  // --- Upcoming Holidays ---
  const upcomingHols: { name: string; date: string; country: string }[] = [];
  for (const h of upcomingHolidays.data ?? []) {
    const hDate = parseISO(h.date);
    let matchDate: Date | null = null;

    if (h.is_recurring) {
      // Check if the recurring date falls within the next week
      const thisYear = new Date(now.getFullYear(), hDate.getMonth(), hDate.getDate());
      if (format(thisYear, "yyyy-MM-dd") >= today && format(thisYear, "yyyy-MM-dd") <= nextWeekEnd) {
        matchDate = thisYear;
      }
    } else {
      if (h.date >= today && h.date <= nextWeekEnd) {
        matchDate = hDate;
      }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {user.full_name || user.email.split("@")[0]}
        </h1>
        <p className="text-gray-600">
          Here&apos;s your overview for today.
        </p>
      </div>

      {/* ===== Needs Attention ===== */}
      {hasAttention && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <AlertTriangle size={16} />
            Needs Attention
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {totalPending > 0 && (
              <Link
                href="/requests"
                className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-800">
                      {isReviewer ? "Pending Approvals" : "My Pending Requests"}
                    </p>
                    <p className="mt-1 text-3xl font-bold text-amber-900">
                      {totalPending}
                    </p>
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-800">
                      {isReviewer ? "Unacknowledged Flags" : "My Unacknowledged Flags"}
                    </p>
                    <p className="mt-1 text-3xl font-bold text-red-900">
                      {unflagged}
                    </p>
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
              {myLeaveTypes.map((key) => {
                const label = leaveTypeLabels[key] ?? key;
                const used = leaveUsed[key] ?? 0;
                const allocated = planAllocations[key] ?? 0;
                const remaining = allocated - used;

                return (
                  <div key={key} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    {hasPlan ? (
                      <>
                        <p className={`mt-1 text-xl font-bold ${remaining <= 0 && allocated > 0 ? "text-red-600" : "text-gray-900"}`}>
                          {remaining}
                          <span className="ml-1 text-xs font-normal text-gray-400">
                            / {allocated}
                          </span>
                        </p>
                        {used > 0 && (
                          <p className="text-[10px] text-gray-400">{used} used</p>
                        )}
                        {remaining < 0 && (
                          <p className="text-[10px] font-medium text-red-500">{Math.abs(remaining)} unpaid</p>
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
    </div>
  );
}
