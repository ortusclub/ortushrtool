import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole, formatDate, formatTime, displayName } from "@/lib/utils";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { AdjustmentActions } from "@/components/adjustments/adjustment-actions";
import { LeaveActions } from "@/components/leave/leave-actions";
import { CancelApprovedLeave } from "@/components/leave/cancel-approved-leave";
import { HolidayWorkActions } from "@/components/holiday-work/holiday-work-actions";
import { OvertimeActions } from "@/components/overtime/overtime-actions";
import { CancelRequest } from "@/components/shared/cancel-request";
import { BuzzManager } from "@/components/shared/buzz-manager";
import { RequestsDateFilter } from "@/components/requests/requests-date-filter";
import { CollapsibleHistory } from "@/components/requests/collapsible-history";
import { EditAdjustmentForm } from "@/components/admin/edit-adjustment-form";
import { EditLeaveForm } from "@/components/admin/edit-leave-form";
import { EditHolidayWorkForm } from "@/components/admin/edit-holiday-work-form";
import { EditOvertimeForm } from "@/components/admin/edit-overtime-form";
import { FileAdjustmentOnBehalf } from "@/components/admin/file-adjustment-on-behalf";
import { BulkAdjustmentsSection } from "@/components/requests/bulk-adjustments-section";
import { BulkLeaveSection } from "@/components/requests/bulk-leave-section";
import { BulkHolidayWorkSection } from "@/components/requests/bulk-holiday-work-section";
import { BulkOvertimeSection } from "@/components/requests/bulk-overtime-section";
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
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: filterFrom, to: filterTo } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isReviewer = hasRole(user.role, "manager");
  const isAdmin = hasRole(user.role, "hr_admin");

  // Build the 4 list queries and run them in parallel.
  let adjQuery = supabase
    .from("schedule_adjustments")
    .select("*, employee:users!schedule_adjustments_employee_id_fkey(full_name, preferred_name, first_name, last_name, email, role)")
    .order("created_at", { ascending: false });
  let leaveQuery = supabase
    .from("leave_requests")
    .select("*, employee:users!leave_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email)")
    .order("created_at", { ascending: false });
  let hwQuery = supabase
    .from("holiday_work_requests")
    .select("*, employee:users!holiday_work_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email), holiday:holidays!holiday_work_requests_holiday_id_fkey(name)")
    .order("created_at", { ascending: false });
  let otQuery = supabase
    .from("overtime_requests")
    .select("*, employee:users!overtime_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email)")
    .order("created_at", { ascending: false });

  if (!isReviewer) {
    adjQuery = adjQuery.eq("employee_id", user.id);
    leaveQuery = leaveQuery.eq("employee_id", user.id);
    hwQuery = hwQuery.eq("employee_id", user.id);
    otQuery = otQuery.eq("employee_id", user.id);
  }

  const allUsersPromise = isAdmin
    ? supabase.from("users").select("id, full_name, preferred_name, first_name, last_name, email").eq("is_active", true).order("full_name")
    : null;

  // Apply date filters
  if (filterFrom) {
    adjQuery = adjQuery.gte("requested_date", filterFrom);
    leaveQuery = leaveQuery.gte("start_date", filterFrom);
    hwQuery = hwQuery.gte("holiday_date", filterFrom);
    otQuery = otQuery.gte("requested_date", filterFrom);
  }
  if (filterTo) {
    adjQuery = adjQuery.lte("requested_date", filterTo);
    leaveQuery = leaveQuery.lte("start_date", filterTo);
    hwQuery = hwQuery.lte("holiday_date", filterTo);
    otQuery = otQuery.lte("requested_date", filterTo);
  }

  const [
    { data: adjustments },
    { data: leaveRequests },
    { data: holidayWorkRequests },
    { data: overtimeRequests },
    allUsersResult,
  ] = await Promise.all([adjQuery, leaveQuery, hwQuery, otQuery, allUsersPromise ?? Promise.resolve(null)]);

  const allUsers = (allUsersResult as { data: { id: string; full_name: string | null; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string }[] } | null)?.data ?? [];

  const pendingOT = (overtimeRequests ?? []).filter((o) => o.status === "pending");
  const pastOT = (overtimeRequests ?? []).filter((o) => o.status !== "pending");

  const pendingAdj = (adjustments ?? []).filter((a) => a.status === "pending");
  const pastAdj = (adjustments ?? []).filter((a) => a.status !== "pending");
  const pendingLeave = (leaveRequests ?? []).filter((l) => l.status === "pending");
  const pastLeave = (leaveRequests ?? []).filter((l) => l.status !== "pending");
  const pendingHW = (holidayWorkRequests ?? []).filter((h) => h.status === "pending");
  const pastHW = (holidayWorkRequests ?? []).filter((h) => h.status !== "pending");

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
        .lte("requested_date", weekEndStr);

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

  const leaveTypeLabels = LEAVE_TYPE_LABELS;

  const actionButtons = (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/requests/schedule-adjustment"
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <ArrowRightLeft size={16} />
        Schedule Adjustment
      </Link>
      <Link
        href="/requests/leave"
        className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
      >
        <CalendarOff size={16} />
        Request Leave
      </Link>
      <Link
        href="/requests/holiday-work"
        className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        <CalendarCheck size={16} />
        Work on Holiday
      </Link>
      {user.overtime_eligible && (
        <Link
          href="/requests/overtime"
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          <Clock4 size={16} />
          Request Overtime
        </Link>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isReviewer ? "Team Requests" : "My Requests"}
          </h1>
          <p className="text-gray-600">
            {isReviewer
              ? "Review schedule adjustment, leave, and holiday work requests"
              : "Track your schedule, leave, and holiday work requests"}
          </p>
        </div>
        {!isReviewer && actionButtons}
      </div>

      <RequestsDateFilter from={filterFrom ?? ""} to={filterTo ?? ""} />

      {isAdmin && (
        <FileAdjustmentOnBehalf employees={allUsers} />
      )}

      {hasRole(user.role, "hr_admin") && (
        <>
          <LeaveCsvImport />
          <AdjustmentCsvImport />
        </>
      )}

      {isReviewer && actionButtons}

      {/* Pending Schedule Adjustments */}
      {pendingAdj.length > 0 && (
        <BulkAdjustmentsSection
          adjustments={pendingAdj}
          officeWarnings={officeWarningsObj}
          currentUserId={user.id}
          isReviewer={isReviewer}
          isAdmin={isAdmin}
        />
      )}

      {/* Pending Leave Requests */}
      {pendingLeave.length > 0 && (
        <BulkLeaveSection
          leaves={pendingLeave}
          currentUserId={user.id}
          isReviewer={isReviewer}
          isAdmin={isAdmin}
        />
      )}

      {/* Pending Holiday Work Requests */}
      {pendingHW.length > 0 && (
        <BulkHolidayWorkSection
          requests={pendingHW}
          currentUserId={user.id}
          isReviewer={isReviewer}
          isAdmin={isAdmin}
        />
      )}

      {/* Pending Overtime Requests */}
      {pendingOT.length > 0 && (
        <BulkOvertimeSection
          requests={pendingOT}
          currentUserId={user.id}
          isReviewer={isReviewer}
          isAdmin={isAdmin}
        />
      )}

      {/* History */}
      <CollapsibleHistory count={pastAdj.length + pastLeave.length + pastHW.length + pastOT.length}>
        {pastAdj.length === 0 && pastLeave.length === 0 && pastHW.length === 0 && pastOT.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No past requests.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pastAdj.map((adj) => (
              <div key={adj.id} className="flex items-center justify-between p-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Schedule Adjustment
                    </span>
                    {isReviewer && adj.employee && (
                      <span className="text-sm font-medium text-gray-900">
                        <UserNameLink
                          userId={adj.employee_id}
                          name={displayName(adj.employee)}
                        />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatDate(adj.requested_date)} &mdash;{" "}
                    {formatTime(adj.requested_start_time)} -{" "}
                    {formatTime(adj.requested_end_time)}
                  </p>
                  {adj.reviewer_notes && (
                    <p className="text-sm text-gray-500 italic">
                      Note: {adj.reviewer_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isReviewer && adj.employee_id !== user.id && (
                    <AdjustmentActions adjustmentId={adj.id} currentStatus={adj.status} />
                  )}
                  {isAdmin && adj.employee_id !== user.id && (
                    <CancelRequest requestId={adj.id} table="schedule_adjustments" />
                  )}
                  {isAdmin && (
                    <EditAdjustmentForm
                      id={adj.id}
                      requestedDate={adj.requested_date}
                      adjustmentType={adj.adjustment_type}
                      requestedStartTime={adj.requested_start_time}
                      requestedEndTime={adj.requested_end_time}
                      requestedWorkLocation={adj.requested_work_location}
                      reason={adj.reason}
                    />
                  )}
                  <StatusBadge status={adj.status} />
                </div>
              </div>
            ))}
            {pastLeave.map((leave) => (
              <div key={leave.id} className="flex items-center justify-between p-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      {leaveTypeLabels[leave.leave_type] ?? leave.leave_type}
                    </span>
                    {isReviewer && leave.employee && (
                      <span className="text-sm font-medium text-gray-900">
                        <UserNameLink
                          userId={leave.employee_id}
                          name={displayName(leave.employee)}
                        />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatDate(leave.start_date)}
                    {leave.leave_duration === "half_day" ? (
                      <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                        Half day ({leave.half_day_period === "am" ? "AM" : "PM"})
                      </span>
                    ) : (
                      <> &mdash; {formatDate(leave.end_date)}</>
                    )}
                  </p>
                  {leave.reviewer_notes && (
                    <p className="text-sm text-gray-500 italic">
                      Note: {leave.reviewer_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isReviewer && leave.employee_id !== user.id && (
                    <LeaveActions leaveId={leave.id} currentStatus={leave.status} />
                  )}
                  <CancelApprovedLeave
                    leaveId={leave.id}
                    startDate={leave.start_date}
                    currentStatus={leave.status}
                  />
                  {isAdmin && leave.employee_id !== user.id && (
                    <CancelRequest requestId={leave.id} table="leave_requests" />
                  )}
                  {isAdmin && (
                    <EditLeaveForm
                      id={leave.id}
                      leaveType={leave.leave_type}
                      leaveDuration={leave.leave_duration}
                      halfDayPeriod={leave.half_day_period}
                      startDate={leave.start_date}
                      endDate={leave.end_date}
                      reason={leave.reason}
                    />
                  )}
                  <StatusBadge status={leave.status} />
                </div>
              </div>
            ))}
            {pastHW.map((hw) => (
              <div key={hw.id} className="flex items-center justify-between p-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                      Holiday Work
                    </span>
                    <span className="text-xs text-gray-500">{hw.holiday?.name}</span>
                    {isReviewer && hw.employee && (
                      <span className="text-sm font-medium text-gray-900">
                        <UserNameLink
                          userId={hw.employee_id}
                          name={displayName(hw.employee)}
                        />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatDate(hw.holiday_date)} &mdash;{" "}
                    {formatTime(hw.start_time)} - {formatTime(hw.end_time)}{" "}
                    <span className="ml-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                      {hw.duration === "half_day" ? "Half Day" : "Full Day"}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Compensation:{" "}
                    <span
                      className={
                        hw.compensation === "cto"
                          ? "font-medium text-teal-700"
                          : "font-medium text-amber-700"
                      }
                    >
                      {hw.compensation === "cto" ? "CTO Leave" : "Holiday Pay"}
                    </span>
                  </p>
                  {hw.reviewer_notes && (
                    <p className="text-sm text-gray-500 italic">
                      Note: {hw.reviewer_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isReviewer && hw.employee_id !== user.id && (
                    <HolidayWorkActions requestId={hw.id} currentStatus={hw.status} />
                  )}
                  {isAdmin && hw.employee_id !== user.id && (
                    <CancelRequest requestId={hw.id} table="holiday_work_requests" />
                  )}
                  {isAdmin && (
                    <EditHolidayWorkForm
                      id={hw.id}
                      duration={hw.duration}
                      startTime={hw.start_time}
                      endTime={hw.end_time}
                      workLocation={hw.work_location}
                      compensation={hw.compensation}
                      reason={hw.reason}
                    />
                  )}
                  <StatusBadge status={hw.status} />
                </div>
              </div>
            ))}
            {pastOT.map((ot) => (
              <div key={ot.id} className="flex items-center justify-between p-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      Overtime
                    </span>
                    {isReviewer && ot.employee && (
                      <span className="text-sm font-medium text-gray-900">
                        <UserNameLink
                          userId={ot.employee_id}
                          name={displayName(ot.employee)}
                        />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatDate(ot.requested_date)} &mdash;{" "}
                    {formatTime(ot.start_time)} - {formatTime(ot.end_time)}
                  </p>
                  {ot.reviewer_notes && (
                    <p className="text-sm text-gray-500 italic">
                      Note: {ot.reviewer_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isReviewer && ot.employee_id !== user.id && (
                    <OvertimeActions overtimeId={ot.id} currentStatus={ot.status} />
                  )}
                  {isAdmin && ot.employee_id !== user.id && (
                    <CancelRequest requestId={ot.id} table="overtime_requests" />
                  )}
                  {isAdmin && (
                    <EditOvertimeForm
                      id={ot.id}
                      requestedDate={ot.requested_date}
                      startTime={ot.start_time}
                      endTime={ot.end_time}
                      reason={ot.reason}
                    />
                  )}
                  <StatusBadge status={ot.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleHistory>
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
