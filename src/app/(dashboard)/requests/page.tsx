import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { hasRole, formatDate, formatTime, displayName, hasNightDifferentialHours } from "@/lib/utils";
import { NightDiffNote } from "@/components/shared/night-diff-note";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { AdjustmentActions } from "@/components/adjustments/adjustment-actions";
import { LeaveActions } from "@/components/leave/leave-actions";
import { CancelApprovedLeave } from "@/components/leave/cancel-approved-leave";
import { HolidayWorkActions } from "@/components/holiday-work/holiday-work-actions";
import { OvertimeActions } from "@/components/overtime/overtime-actions";
import { CancelRequest } from "@/components/shared/cancel-request";
import { BuzzManager } from "@/components/shared/buzz-manager";
import { RequestsDateFilter } from "@/components/requests/requests-date-filter";
import { RequestsRequesterSearch } from "@/components/requests/requests-requester-filter";
import { CollapsibleHistory } from "@/components/requests/collapsible-history";
import { EditAdjustmentForm } from "@/components/admin/edit-adjustment-form";
import { EditLeaveForm } from "@/components/admin/edit-leave-form";
import { EditHolidayWorkForm } from "@/components/admin/edit-holiday-work-form";
import { EditOvertimeForm } from "@/components/admin/edit-overtime-form";
import { FileAdjustmentOnBehalf } from "@/components/admin/file-adjustment-on-behalf";
import { FileLeaveOnBehalf } from "@/components/admin/file-leave-on-behalf";
import { BulkAdjustmentsSection } from "@/components/requests/bulk-adjustments-section";
import { BulkLeaveSection } from "@/components/requests/bulk-leave-section";
import { BulkHolidayWorkSection } from "@/components/requests/bulk-holiday-work-section";
import { BulkOvertimeSection } from "@/components/requests/bulk-overtime-section";
import { CollapsibleSection } from "@/components/requests/collapsible-section";
import Link from "next/link";
import {
  ArrowRightLeft,
  CalendarOff,
  CalendarCheck,
  AlertTriangle,
  Clock4,
} from "lucide-react";
import { startOfWeek, addDays, format } from "date-fns";
import { LeaveCsvImport } from "@/components/admin/leave-csv-import";
import { AdjustmentCsvImport } from "@/components/admin/adjustment-csv-import";
import { UserNameLink } from "@/components/shared/user-name-link";

export default async function RequestsPage({
  searchParams,
}: {
  // Many per-section filter params (req_*/hreq_* requester searches and
  // <type>_p{f,t}/<type>_h{f,t} date ranges), so read them off a flat object.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const myFrom = sp.myfrom;
  const myTo = sp.myto;
  const reqAdj = sp.req_adj, reqLeave = sp.req_leave, reqHw = sp.req_hw, reqOt = sp.req_ot;
  const hreqAdj = sp.hreq_adj, hreqLeave = sp.hreq_leave, hreqHw = sp.hreq_hw, hreqOt = sp.hreq_ot;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isReviewer = hasRole(user.role, "manager");
  const isAdmin = hasRole(user.role, "hr_admin");

  const adjSel = "*, employee:users!schedule_adjustments_employee_id_fkey(full_name, preferred_name, first_name, last_name, email, role)";
  const leaveSel = "*, employee:users!leave_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email)";
  const hwSel = "*, employee:users!holiday_work_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email), holiday:holidays!holiday_work_requests_holiday_id_fkey(name)";
  const otSel = "*, employee:users!overtime_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email)";

  // My requests — always filtered to current user
  let myAdjQ = supabase.from("schedule_adjustments").select(adjSel).eq("employee_id", user.id).order("created_at", { ascending: false });
  let myLeaveQ = supabase.from("leave_requests").select(leaveSel).eq("employee_id", user.id).order("created_at", { ascending: false });
  let myHwQ = supabase.from("holiday_work_requests").select(hwSel).eq("employee_id", user.id).order("created_at", { ascending: false });
  let myOtQ = supabase.from("overtime_requests").select(otSel).eq("employee_id", user.id).order("created_at", { ascending: false });

  if (myFrom) { myAdjQ = myAdjQ.gte("requested_date", myFrom); myLeaveQ = myLeaveQ.gte("start_date", myFrom); myHwQ = myHwQ.gte("holiday_date", myFrom); myOtQ = myOtQ.gte("requested_date", myFrom); }
  if (myTo)   { myAdjQ = myAdjQ.lte("requested_date", myTo);   myLeaveQ = myLeaveQ.lte("start_date", myTo);   myHwQ = myHwQ.lte("holiday_date", myTo);   myOtQ = myOtQ.lte("requested_date", myTo); }

  // Team requests — only for reviewers, excludes current user. These are
  // company-wide reads, so page past PostgREST's 1000-row cap (fetchAllRows);
  // otherwise team requests past row 1000 silently vanish — including pending
  // approvals. Secondary order by id keeps the page windows stable on ties.
  const teamAdjP = isReviewer
    ? fetchAllRows((from, to) => supabase.from("schedule_adjustments").select(adjSel).neq("employee_id", user.id).order("created_at", { ascending: false }).order("id").range(from, to))
    : Promise.resolve([]);
  const teamLeaveP = isReviewer
    ? fetchAllRows((from, to) => supabase.from("leave_requests").select(leaveSel).neq("employee_id", user.id).order("created_at", { ascending: false }).order("id").range(from, to))
    : Promise.resolve([]);
  const teamHwP = isReviewer
    ? fetchAllRows((from, to) => supabase.from("holiday_work_requests").select(hwSel).neq("employee_id", user.id).order("created_at", { ascending: false }).order("id").range(from, to))
    : Promise.resolve([]);
  const teamOtP = isReviewer
    ? fetchAllRows((from, to) => supabase.from("overtime_requests").select(otSel).neq("employee_id", user.id).order("created_at", { ascending: false }).order("id").range(from, to))
    : Promise.resolve([]);

  // Team date filtering is per-section (pending vs history, per type) and done
  // in-memory below, so the team queries themselves aren't date-bounded here.

  const allUsersPromise = isAdmin
    ? supabase.from("users").select("id, full_name, preferred_name, first_name, last_name, email").eq("is_active", true).order("full_name")
    : null;

  const [
    { data: myAdj },
    { data: myLeave },
    { data: myHw },
    { data: myOt },
    teamAdj,
    teamLeave,
    teamHw,
    teamOt,
    allUsersResult,
  ] = await Promise.all([
    myAdjQ, myLeaveQ, myHwQ, myOtQ,
    teamAdjP, teamLeaveP, teamHwP, teamOtP,
    allUsersPromise ?? Promise.resolve(null),
  ]);

  const allUsers = (allUsersResult as { data: { id: string; full_name: string | null; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string }[] } | null)?.data ?? [];

  // Split by pending/past
  const myPendingAdj   = (myAdj   ?? []).filter(a => a.status === "pending");
  const myPastAdj      = (myAdj   ?? []).filter(a => a.status !== "pending");
  const myPendingLeave = (myLeave ?? []).filter(l => l.status === "pending");
  const myPastLeave    = (myLeave ?? []).filter(l => l.status !== "pending");
  const myPendingHw    = (myHw    ?? []).filter(h => h.status === "pending");
  const myPastHw       = (myHw    ?? []).filter(h => h.status !== "pending");
  const myPendingOt    = (myOt    ?? []).filter(o => o.status === "pending");
  const myPastOt       = (myOt    ?? []).filter(o => o.status !== "pending");

  // My Requests pending: myq search (date stays on the SQL myfrom/myto filter above).
  const myPendingAdjF   = byRequesterName(myPendingAdj,   sp.myq);
  const myPendingLeaveF = byRequesterName(myPendingLeave, sp.myq);
  const myPendingHwF    = byRequesterName(myPendingHw,    sp.myq);
  const myPendingOtF    = byRequesterName(myPendingOt,    sp.myq);
  // My Requests history is split per type, each its own collapsible with its own
  // date range (my<type>_h{f,t}). No requester search — it's all the current user.
  const myPastAdjF   = inDateRange(myPastAdj,   "requested_date", sp.myadj_hf,   sp.myadj_ht);
  const myPastLeaveF = inDateRange(myPastLeave, "start_date",     sp.myleave_hf, sp.myleave_ht);
  const myPastHwF    = inDateRange(myPastHw,    "holiday_date",   sp.myhw_hf,    sp.myhw_ht);
  const myPastOtF    = inDateRange(myPastOt,    "requested_date", sp.myot_hf,    sp.myot_ht);

  // Per-type requester search (Team section only). Each request type — and the
  // pending vs history view of it — has its own free-text search box + URL
  // param, matched against the requester's display name. Free text scales
  // better than a dropdown as the team grows.
  type NamedEmployee = { employee: { full_name: string | null; preferred_name: string | null; first_name: string | null; last_name: string | null } | null };
  function byRequesterName<T extends NamedEmployee>(rows: T[], q?: string) {
    const s = (q ?? "").trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => r.employee && displayName(r.employee).toLowerCase().includes(s));
  }
  // Filter by the row's date field (yyyy-MM-dd strings compare correctly).
  function inDateRange<T>(rows: T[], field: string, from?: string, to?: string) {
    let out = rows;
    if (from) out = out.filter(r => String((r as Record<string, unknown>)[field] ?? "") >= from);
    if (to)   out = out.filter(r => String((r as Record<string, unknown>)[field] ?? "") <= to);
    return out;
  }
  // Apply both requester search and date range for one section.
  function filterSection<T extends NamedEmployee>(rows: T[], dateField: string, q: string | undefined, from: string | undefined, to: string | undefined) {
    return byRequesterName(inDateRange(rows, dateField, from, to), q);
  }

  // Unfiltered pending/past per type — drives whether each search box shows.
  const pendingAdjAll   = (teamAdj   ?? []).filter(a => a.status === "pending");
  const pastAdjAll      = (teamAdj   ?? []).filter(a => a.status !== "pending");
  const pendingLeaveAll = (teamLeave ?? []).filter(l => l.status === "pending");
  const pastLeaveAll    = (teamLeave ?? []).filter(l => l.status !== "pending");
  const pendingHwAll    = (teamHw    ?? []).filter(h => h.status === "pending");
  const pastHwAll       = (teamHw    ?? []).filter(h => h.status !== "pending");
  const pendingOtAll    = (teamOt    ?? []).filter(o => o.status === "pending");
  const pastOtAll       = (teamOt    ?? []).filter(o => o.status !== "pending");

  // Each section filters independently by its own requester search + date
  // range. Pending uses *_p{f,t}; history uses *_h{f,t}. Date fields per type:
  // adjustments/overtime -> requested_date, leave -> start_date, hw -> holiday_date.
  const teamPendingAdj   = filterSection(pendingAdjAll,   "requested_date", reqAdj,   sp.adj_pf,   sp.adj_pt);
  const teamPendingLeave = filterSection(pendingLeaveAll, "start_date",     reqLeave, sp.leave_pf, sp.leave_pt);
  const teamPendingHw    = filterSection(pendingHwAll,    "holiday_date",   reqHw,    sp.hw_pf,    sp.hw_pt);
  const teamPendingOt    = filterSection(pendingOtAll,    "requested_date", reqOt,    sp.ot_pf,    sp.ot_pt);
  const teamPastAdj   = filterSection(pastAdjAll,   "requested_date", hreqAdj,   sp.adj_hf,   sp.adj_ht);
  const teamPastLeave = filterSection(pastLeaveAll, "start_date",     hreqLeave, sp.leave_hf, sp.leave_ht);
  const teamPastHw    = filterSection(pastHwAll,    "holiday_date",   hreqHw,    sp.hw_hf,    sp.hw_ht);
  const teamPastOt    = filterSection(pastOtAll,    "requested_date", hreqOt,    sp.ot_hf,    sp.ot_ht);

  // For backwards compat with office-warnings logic
  const pendingAdj = [...myPendingAdj, ...teamPendingAdj];

  // --- Compute office day warnings for pending adjustments ---
  const officeWarnings = new Map<string, { officeDays: number; threshold: number }>();

  if (pendingAdj.length > 0) {
    // Gather unique employee IDs and week ranges
    const employeeIds = [...new Set(pendingAdj.map((a) => a.employee_id))];

    // Fetch base schedules for all relevant employees
    const today = new Date().toISOString().split("T")[0];
    const { data: allSchedules } = await supabase
      .from("schedules")
      .select("employee_id, day_of_week, work_location, is_rest_day")
      .in("employee_id", employeeIds)
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`);

    // Build schedule map: employeeId -> dayOfWeek -> work_location
    const scheduleMap = new Map<string, Map<number, string | null>>();
    for (const s of allSchedules ?? []) {
      if (!scheduleMap.has(s.employee_id)) scheduleMap.set(s.employee_id, new Map());
      const userMap = scheduleMap.get(s.employee_id)!;
      userMap.set(s.day_of_week, s.is_rest_day ? null : s.work_location);
    }

    // For each pending adjustment, compute office days for its week
    for (const adj of pendingAdj) {
      if (adj.requested_date === "9999-12-31") continue; // Skip permanent
      // A time-only adjustment doesn't change work location, so it can never
      // reduce office presence — skip the warning. (A low office count that
      // week comes from other days, not this time change.)
      if (!adj.requested_work_location) continue;

      const reqDate = new Date(adj.requested_date + "T00:00:00");
      const weekMon = startOfWeek(reqDate, { weekStartsOn: 1 });
      const weekStartStr = format(weekMon, "yyyy-MM-dd");
      const weekEndStr = format(addDays(weekMon, 4), "yyyy-MM-dd");

      // Fetch approved adjustments for this employee in this week
      const { data: weekAdjs } = await supabase
        .from("schedule_adjustments")
        .select("requested_date, requested_work_location")
        .eq("employee_id", adj.employee_id)
        .eq("status", "approved")
        .gte("requested_date", weekStartStr)
        .lte("requested_date", weekEndStr)
        // Oldest first so the most recent approved adjustment wins per date.
        .order("created_at", { ascending: true });

      // Build override map for the week: date -> location
      const adjOverrides = new Map<string, string | null>();
      for (const a of weekAdjs ?? []) {
        adjOverrides.set(a.requested_date, a.requested_work_location);
      }

      // Simulate this pending adjustment as if approved
      adjOverrides.set(adj.requested_date, adj.requested_work_location ?? null);

      // Count office days Mon-Fri
      const userSchedule = scheduleMap.get(adj.employee_id);
      let officeDays = 0;

      for (let i = 0; i < 5; i++) {
        const dayDate = format(addDays(weekMon, i), "yyyy-MM-dd");
        const override = adjOverrides.get(dayDate);

        if (override !== undefined) {
          // There's an adjustment for this day
          if (override === "office") officeDays++;
          // If override is "online" or null, check: null means only time changed, fall back to base
          else if (override === null) {
            const baseLocation = userSchedule?.get(i);
            if (baseLocation === "office") officeDays++;
          }
          // "online" = not office, don't count
        } else {
          // No adjustment, use base schedule
          const baseLocation = userSchedule?.get(i);
          if (baseLocation === "office") officeDays++;
        }
      }

      const employeeRole = adj.employee?.role ?? "employee";
      const threshold = hasRole(employeeRole, "manager") ? 3 : 2;

      if (officeDays < threshold) {
        officeWarnings.set(adj.id, { officeDays, threshold });
      }
    }
  }

  const officeWarningsObj = Object.fromEntries(officeWarnings);

  const actionButtons = (
    <div className="flex flex-wrap gap-2">
      <Link href="/requests/schedule-adjustment" className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
        <ArrowRightLeft size={15} /> Schedule Adjustment
      </Link>
      <Link href="/requests/leave" className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700">
        <CalendarOff size={15} /> Request Leave
      </Link>
      <Link href="/requests/holiday-work" className="flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
        <CalendarCheck size={15} /> Work on Holiday
      </Link>
      {user.overtime_eligible && (
        <Link href="/requests/overtime" className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700">
          <Clock4 size={15} /> Request Overtime
        </Link>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Requests</h1>

      {/* ── ADMIN CONSOLE ── */}
      {isAdmin && (
        <CollapsibleSection title="Admin Console" defaultOpen={false} accent="amber">
          <FileLeaveOnBehalf employees={allUsers} />
          <FileAdjustmentOnBehalf employees={allUsers} />
          <LeaveCsvImport />
          <AdjustmentCsvImport />
        </CollapsibleSection>
      )}

      {/* ── MY REQUESTS ── */}
      <CollapsibleSection title="My Requests" accent="indigo" actions={actionButtons}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <RequestsDateFilter from={myFrom ?? ""} to={myTo ?? ""} paramFrom="myfrom" paramTo="myto" />
          <RequestsRequesterSearch param="myq" label="requests" initial={sp.myq ?? ""} />
        </div>

        {myPendingAdjF.length > 0 && (
          <BulkAdjustmentsSection adjustments={myPendingAdjF} officeWarnings={officeWarningsObj} currentUserId={user.id} isReviewer={false} isAdmin={isAdmin} />
        )}
        {myPendingLeaveF.length > 0 && (
          <BulkLeaveSection leaves={myPendingLeaveF} currentUserId={user.id} isReviewer={false} isAdmin={isAdmin} />
        )}
        {myPendingHwF.length > 0 && (
          <BulkHolidayWorkSection requests={myPendingHwF} currentUserId={user.id} isReviewer={false} isAdmin={isAdmin} />
        )}
        {myPendingOtF.length > 0 && (
          <BulkOvertimeSection requests={myPendingOtF} currentUserId={user.id} isReviewer={false} isAdmin={isAdmin} />
        )}
        {myPendingAdjF.length === 0 && myPendingLeaveF.length === 0 && myPendingHwF.length === 0 && myPendingOtF.length === 0 && (
          <p className="text-sm text-gray-500">No pending requests.</p>
        )}

        {/* History is split per request type — each its own collapsible. */}
        <CollapsibleHistory label="Schedule Adjustment History" count={myPastAdj.length}>
          {myPastAdj.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No history yet.</div>
          ) : (
            <>
              <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <RequestsDateFilter from={sp.myadj_hf ?? ""} to={sp.myadj_ht ?? ""} paramFrom="myadj_hf" paramTo="myadj_ht" />
              </div>
              {myPastAdjF.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">No adjustments match that date range.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {myPastAdjF.map((adj) => (
                    <div key={adj.id} className="flex items-center justify-between p-6">
                      <div className="space-y-1">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Schedule Adjustment</span>
                        <p className="text-sm text-gray-700">{formatDate(adj.requested_date)} &mdash; {formatTime(adj.requested_start_time)} – {formatTime(adj.requested_end_time)}</p>
                        {adj.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {adj.reviewer_notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        {isAdmin && <EditAdjustmentForm id={adj.id} requestedDate={adj.requested_date} adjustmentType={adj.adjustment_type} requestedStartTime={adj.requested_start_time} requestedEndTime={adj.requested_end_time} requestedWorkLocation={adj.requested_work_location} reason={adj.reason} />}
                        <StatusBadge status={adj.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleHistory>

        <CollapsibleHistory label="Leave History" count={myPastLeave.length}>
          {myPastLeave.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No history yet.</div>
          ) : (
            <>
              <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <RequestsDateFilter from={sp.myleave_hf ?? ""} to={sp.myleave_ht ?? ""} paramFrom="myleave_hf" paramTo="myleave_ht" />
              </div>
              {myPastLeaveF.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">No leave matches that date range.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {myPastLeaveF.map((leave) => (
                    <div key={leave.id} className="flex items-center justify-between p-6">
                      <div className="space-y-1">
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">{LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type}</span>
                        <p className="text-sm text-gray-700">{formatDate(leave.start_date)}{leave.leave_duration === "half_day" ? <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">Half day ({leave.half_day_period === "am" ? "AM" : "PM"})</span> : <> &mdash; {formatDate(leave.end_date)}</>}</p>
                        {leave.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {leave.reviewer_notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <CancelApprovedLeave leaveId={leave.id} startDate={leave.start_date} currentStatus={leave.status} />
                        {/* History is past/non-pending; self-edit is pending-only, so
                            only admins edit here. Owners edit pending leave above. */}
                        {isAdmin && <EditLeaveForm id={leave.id} leaveType={leave.leave_type} leaveDuration={leave.leave_duration} halfDayPeriod={leave.half_day_period} startDate={leave.start_date} endDate={leave.end_date} reason={leave.reason} />}
                        <StatusBadge status={leave.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleHistory>

        <CollapsibleHistory label="Holiday Work History" count={myPastHw.length}>
          {myPastHw.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No history yet.</div>
          ) : (
            <>
              <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <RequestsDateFilter from={sp.myhw_hf ?? ""} to={sp.myhw_ht ?? ""} paramFrom="myhw_hf" paramTo="myhw_ht" />
              </div>
              {myPastHwF.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">No holiday work matches that date range.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {myPastHwF.map((hw) => (
                    <div key={hw.id} className="flex items-center justify-between p-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2"><span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">Holiday Work</span><span className="text-xs text-gray-500">{hw.holiday?.name}</span></div>
                        <p className="text-sm text-gray-700">{formatDate(hw.holiday_date)} &mdash; {formatTime(hw.start_time)} – {formatTime(hw.end_time)}</p>
                        {hw.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {hw.reviewer_notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        {isAdmin && <EditHolidayWorkForm id={hw.id} duration={hw.duration} startTime={hw.start_time} endTime={hw.end_time} workLocation={hw.work_location} compensation={hw.compensation} reason={hw.reason} />}
                        <StatusBadge status={hw.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleHistory>

        <CollapsibleHistory label="Overtime History" count={myPastOt.length}>
          {myPastOt.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No history yet.</div>
          ) : (
            <>
              <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <RequestsDateFilter from={sp.myot_hf ?? ""} to={sp.myot_ht ?? ""} paramFrom="myot_hf" paramTo="myot_ht" />
              </div>
              {myPastOtF.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">No overtime matches that date range.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {myPastOtF.map((ot) => (
                    <div key={ot.id} className="flex items-center justify-between p-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Overtime</span>
                          {hasNightDifferentialHours(ot.start_time, ot.end_time) && <NightDiffNote size="xs" />}
                        </div>
                        <p className="text-sm text-gray-700">{formatDate(ot.requested_date)} &mdash; {formatTime(ot.start_time)} – {formatTime(ot.end_time)}</p>
                        {ot.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {ot.reviewer_notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        {isAdmin && <EditOvertimeForm id={ot.id} requestedDate={ot.requested_date} startTime={ot.start_time} endTime={ot.end_time} reason={ot.reason} />}
                        <StatusBadge status={ot.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleHistory>
      </CollapsibleSection>

      {/* ── TEAM REQUESTS ── */}
      {isReviewer && (
        <CollapsibleSection title="Team Requests" accent="emerald">
          {pendingAdjAll.length > 0 && (
            <BulkAdjustmentsSection
              adjustments={teamPendingAdj}
              officeWarnings={officeWarningsObj}
              currentUserId={user.id}
              isReviewer={isReviewer}
              isAdmin={isAdmin}
              filters={<>
                <RequestsDateFilter from={sp.adj_pf ?? ""} to={sp.adj_pt ?? ""} paramFrom="adj_pf" paramTo="adj_pt" />
                <RequestsRequesterSearch param="req_adj" label="adjustments" initial={reqAdj ?? ""} />
              </>}
            />
          )}
          {pendingLeaveAll.length > 0 && (
            <BulkLeaveSection
              leaves={teamPendingLeave}
              currentUserId={user.id}
              isReviewer={isReviewer}
              isAdmin={isAdmin}
              filters={<>
                <RequestsDateFilter from={sp.leave_pf ?? ""} to={sp.leave_pt ?? ""} paramFrom="leave_pf" paramTo="leave_pt" />
                <RequestsRequesterSearch param="req_leave" label="leave" initial={reqLeave ?? ""} />
              </>}
            />
          )}
          {pendingHwAll.length > 0 && (
            <BulkHolidayWorkSection
              requests={teamPendingHw}
              currentUserId={user.id}
              isReviewer={isReviewer}
              isAdmin={isAdmin}
              filters={<>
                <RequestsDateFilter from={sp.hw_pf ?? ""} to={sp.hw_pt ?? ""} paramFrom="hw_pf" paramTo="hw_pt" />
                <RequestsRequesterSearch param="req_hw" label="holiday work" initial={reqHw ?? ""} />
              </>}
            />
          )}
          {pendingOtAll.length > 0 && (
            <BulkOvertimeSection
              requests={teamPendingOt}
              currentUserId={user.id}
              isReviewer={isReviewer}
              isAdmin={isAdmin}
              filters={<>
                <RequestsDateFilter from={sp.ot_pf ?? ""} to={sp.ot_pt ?? ""} paramFrom="ot_pf" paramTo="ot_pt" />
                <RequestsRequesterSearch param="req_ot" label="overtime" initial={reqOt ?? ""} />
              </>}
            />
          )}
          {pendingAdjAll.length === 0 && pendingLeaveAll.length === 0 && pendingHwAll.length === 0 && pendingOtAll.length === 0 && (
            <p className="text-sm text-gray-500">No pending team requests.</p>
          )}

          {/* History is split per request type — each its own collapsible. */}
          <CollapsibleHistory label="Schedule Adjustment History" count={pastAdjAll.length}>
            {pastAdjAll.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No history yet.</div>
            ) : (
              <>
                <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <RequestsDateFilter from={sp.adj_hf ?? ""} to={sp.adj_ht ?? ""} paramFrom="adj_hf" paramTo="adj_ht" />
                  <RequestsRequesterSearch param="hreq_adj" label="adjustments" initial={hreqAdj ?? ""} />
                </div>
                {teamPastAdj.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-gray-500">No adjustments match that filter.</p>
                ) : (
                <div className="divide-y divide-gray-100">
                {teamPastAdj.map((adj) => (
                  <div key={adj.id} className="flex items-center justify-between p-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Schedule Adjustment</span>
                        {adj.employee && <span className="text-sm font-medium text-gray-900"><UserNameLink userId={adj.employee_id} name={displayName(adj.employee)} /></span>}
                      </div>
                      <p className="text-sm text-gray-700">{formatDate(adj.requested_date)} &mdash; {formatTime(adj.requested_start_time)} – {formatTime(adj.requested_end_time)}</p>
                      {adj.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {adj.reviewer_notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <AdjustmentActions adjustmentId={adj.id} currentStatus={adj.status} />
                      {isAdmin && <CancelRequest requestId={adj.id} table="schedule_adjustments" />}
                      {isAdmin && <EditAdjustmentForm id={adj.id} requestedDate={adj.requested_date} adjustmentType={adj.adjustment_type} requestedStartTime={adj.requested_start_time} requestedEndTime={adj.requested_end_time} requestedWorkLocation={adj.requested_work_location} reason={adj.reason} />}
                      <StatusBadge status={adj.status} />
                    </div>
                  </div>
                ))}
                </div>
                )}
              </>
            )}
          </CollapsibleHistory>

          <CollapsibleHistory label="Leave History" count={pastLeaveAll.length}>
            {pastLeaveAll.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No history yet.</div>
            ) : (
              <>
                <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <RequestsDateFilter from={sp.leave_hf ?? ""} to={sp.leave_ht ?? ""} paramFrom="leave_hf" paramTo="leave_ht" />
                  <RequestsRequesterSearch param="hreq_leave" label="leave" initial={hreqLeave ?? ""} />
                </div>
                {teamPastLeave.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-gray-500">No leave matches that filter.</p>
                ) : (
                <div className="divide-y divide-gray-100">
                {teamPastLeave.map((leave) => (
                  <div key={leave.id} className="flex items-center justify-between p-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">{LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type}</span>
                        {leave.employee && <span className="text-sm font-medium text-gray-900"><UserNameLink userId={leave.employee_id} name={displayName(leave.employee)} /></span>}
                      </div>
                      <p className="text-sm text-gray-700">{formatDate(leave.start_date)}{leave.leave_duration === "half_day" ? <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">Half day ({leave.half_day_period === "am" ? "AM" : "PM"})</span> : <> &mdash; {formatDate(leave.end_date)}</>}</p>
                      {leave.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {leave.reviewer_notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <LeaveActions leaveId={leave.id} currentStatus={leave.status} />
                      <CancelApprovedLeave leaveId={leave.id} startDate={leave.start_date} currentStatus={leave.status} />
                      {isAdmin && <CancelRequest requestId={leave.id} table="leave_requests" />}
                      {isAdmin && <EditLeaveForm id={leave.id} leaveType={leave.leave_type} leaveDuration={leave.leave_duration} halfDayPeriod={leave.half_day_period} startDate={leave.start_date} endDate={leave.end_date} reason={leave.reason} />}
                      <StatusBadge status={leave.status} />
                    </div>
                  </div>
                ))}
                </div>
                )}
              </>
            )}
          </CollapsibleHistory>

          <CollapsibleHistory label="Holiday Work History" count={pastHwAll.length}>
            {pastHwAll.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No history yet.</div>
            ) : (
              <>
                <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <RequestsDateFilter from={sp.hw_hf ?? ""} to={sp.hw_ht ?? ""} paramFrom="hw_hf" paramTo="hw_ht" />
                  <RequestsRequesterSearch param="hreq_hw" label="holiday work" initial={hreqHw ?? ""} />
                </div>
                {teamPastHw.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-gray-500">No holiday work matches that filter.</p>
                ) : (
                <div className="divide-y divide-gray-100">
                {teamPastHw.map((hw) => (
                  <div key={hw.id} className="flex items-center justify-between p-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">Holiday Work</span>
                        <span className="text-xs text-gray-500">{hw.holiday?.name}</span>
                        {hw.employee && <span className="text-sm font-medium text-gray-900"><UserNameLink userId={hw.employee_id} name={displayName(hw.employee)} /></span>}
                      </div>
                      <p className="text-sm text-gray-700">{formatDate(hw.holiday_date)} &mdash; {formatTime(hw.start_time)} – {formatTime(hw.end_time)}</p>
                      {hw.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {hw.reviewer_notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <HolidayWorkActions requestId={hw.id} currentStatus={hw.status} />
                      {isAdmin && <CancelRequest requestId={hw.id} table="holiday_work_requests" />}
                      {isAdmin && <EditHolidayWorkForm id={hw.id} duration={hw.duration} startTime={hw.start_time} endTime={hw.end_time} workLocation={hw.work_location} compensation={hw.compensation} reason={hw.reason} />}
                      <StatusBadge status={hw.status} />
                    </div>
                  </div>
                ))}
                </div>
                )}
              </>
            )}
          </CollapsibleHistory>

          <CollapsibleHistory label="Overtime History" count={pastOtAll.length}>
            {pastOtAll.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No history yet.</div>
            ) : (
              <>
                <div className="bg-gray-50/60 px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <RequestsDateFilter from={sp.ot_hf ?? ""} to={sp.ot_ht ?? ""} paramFrom="ot_hf" paramTo="ot_ht" />
                  <RequestsRequesterSearch param="hreq_ot" label="overtime" initial={hreqOt ?? ""} />
                </div>
                {teamPastOt.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-gray-500">No overtime matches that filter.</p>
                ) : (
                <div className="divide-y divide-gray-100">
                {teamPastOt.map((ot) => (
                  <div key={ot.id} className="flex items-center justify-between p-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Overtime</span>
                        {ot.employee && <span className="text-sm font-medium text-gray-900"><UserNameLink userId={ot.employee_id} name={displayName(ot.employee)} /></span>}
                        {hasNightDifferentialHours(ot.start_time, ot.end_time) && <NightDiffNote size="xs" />}
                      </div>
                      <p className="text-sm text-gray-700">{formatDate(ot.requested_date)} &mdash; {formatTime(ot.start_time)} – {formatTime(ot.end_time)}</p>
                      {ot.reviewer_notes && <p className="text-sm text-gray-500 italic">Note: {ot.reviewer_notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <OvertimeActions overtimeId={ot.id} currentStatus={ot.status} />
                      {isAdmin && <CancelRequest requestId={ot.id} table="overtime_requests" />}
                      {isAdmin && <EditOvertimeForm id={ot.id} requestedDate={ot.requested_date} startTime={ot.start_time} endTime={ot.end_time} reason={ot.reason} />}
                      <StatusBadge status={ot.status} />
                    </div>
                  </div>
                ))}
                </div>
                )}
              </>
            )}
          </CollapsibleHistory>
        </CollapsibleSection>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${styles[status] ?? "bg-gray-100"}`}>
      {status}
    </span>
  );
}
