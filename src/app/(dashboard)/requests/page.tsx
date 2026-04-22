import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole, formatDate, formatTime } from "@/lib/utils";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { AdjustmentActions } from "@/components/adjustments/adjustment-actions";
import { LeaveActions } from "@/components/leave/leave-actions";
import { HolidayWorkActions } from "@/components/holiday-work/holiday-work-actions";
import { CancelRequest } from "@/components/shared/cancel-request";
import { BuzzManager } from "@/components/shared/buzz-manager";
import Link from "next/link";
import { ArrowRightLeft, CalendarOff, CalendarCheck, AlertTriangle } from "lucide-react";
import { startOfWeek, addDays, format } from "date-fns";
import { LeaveCsvImport } from "@/components/admin/leave-csv-import";
import { AdjustmentCsvImport } from "@/components/admin/adjustment-csv-import";

export default async function RequestsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isReviewer = hasRole(user.role, "manager");

  // Fetch schedule adjustments (include role for office day threshold)
  let adjQuery = supabase
    .from("schedule_adjustments")
    .select("*, employee:users!schedule_adjustments_employee_id_fkey(full_name, email, role)")
    .order("created_at", { ascending: false });

  if (!isReviewer) {
    adjQuery = adjQuery.eq("employee_id", user.id);
  }

  const { data: adjustments } = await adjQuery;

  // Fetch leave requests
  let leaveQuery = supabase
    .from("leave_requests")
    .select("*, employee:users!leave_requests_employee_id_fkey(full_name, email)")
    .order("created_at", { ascending: false });

  if (!isReviewer) {
    leaveQuery = leaveQuery.eq("employee_id", user.id);
  }

  const { data: leaveRequests } = await leaveQuery;

  // Fetch holiday work requests
  let hwQuery = supabase
    .from("holiday_work_requests")
    .select("*, employee:users!holiday_work_requests_employee_id_fkey(full_name, email), holiday:holidays!holiday_work_requests_holiday_id_fkey(name)")
    .order("created_at", { ascending: false });

  if (!isReviewer) {
    hwQuery = hwQuery.eq("employee_id", user.id);
  }

  const { data: holidayWorkRequests } = await hwQuery;

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

      {hasRole(user.role, "hr_admin") && (
        <>
          <LeaveCsvImport />
          <AdjustmentCsvImport />
        </>
      )}

      {isReviewer && actionButtons}

      {/* Pending Schedule Adjustments */}
      {pendingAdj.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Schedule Adjustments ({pendingAdj.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingAdj.map((adj) => {
              const warning = officeWarnings.get(adj.id);
              return (
                <div key={adj.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      {isReviewer && adj.employee && (
                        <p className="font-medium text-gray-900">
                          {adj.employee.full_name || adj.employee.email}
                        </p>
                      )}
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Date:</span>{" "}
                        {formatDate(adj.requested_date)}
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Original:</span>{" "}
                        {formatTime(adj.original_start_time)} -{" "}
                        {formatTime(adj.original_end_time)}
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Requested:</span>{" "}
                        {formatTime(adj.requested_start_time)} -{" "}
                        {formatTime(adj.requested_end_time)}
                      </p>
                      {adj.requested_work_location && (
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Location:</span>{" "}
                          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${adj.requested_work_location === "office" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {adj.requested_work_location === "office" ? "Office" : "Online"}
                          </span>
                        </p>
                      )}
                      <p className="text-sm text-gray-600">{adj.reason}</p>
                      {warning && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                          <AlertTriangle size={14} className="text-red-500 shrink-0" />
                          <span className="text-xs text-red-700">
                            Approving this would leave only {warning.officeDays} office day{warning.officeDays !== 1 ? "s" : ""} this week (minimum {warning.threshold} required)
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {isReviewer && <AdjustmentActions adjustmentId={adj.id} />}
                      {!isReviewer && (
                        <>
                          <BuzzManager requestId={adj.id} requestType="schedule_adjustment" />
                          <CancelRequest requestId={adj.id} table="schedule_adjustments" />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Leave Requests */}
      {pendingLeave.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-white shadow-sm">
          <div className="border-b border-purple-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Leave Requests ({pendingLeave.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingLeave.map((leave) => (
              <div key={leave.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    {isReviewer && leave.employee && (
                      <p className="font-medium text-gray-900">
                        {leave.employee.full_name || leave.employee.email}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {leaveTypeLabels[leave.leave_type] ?? leave.leave_type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">
                      {leave.leave_duration === "half_day" ? (
                        <>
                          <span className="font-medium">Date:</span> {formatDate(leave.start_date)}
                          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                            Half day ({leave.half_day_period === "am" ? "AM" : "PM"})
                          </span>
                          {leave.half_day_start_time && leave.half_day_end_time && (
                            <span className="ml-1 text-xs text-gray-500">
                              {formatTime(leave.half_day_start_time)} - {formatTime(leave.half_day_end_time)}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="font-medium">From:</span>{" "}
                          {formatDate(leave.start_date)} &mdash;{" "}
                          <span className="font-medium">To:</span>{" "}
                          {formatDate(leave.end_date)}
                        </>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">{leave.reason}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {isReviewer && <LeaveActions leaveId={leave.id} />}
                    {!isReviewer && (
                      <>
                        <BuzzManager requestId={leave.id} requestType="leave" />
                        <CancelRequest requestId={leave.id} table="leave_requests" />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Holiday Work Requests */}
      {pendingHW.length > 0 && (
        <div className="rounded-xl border border-teal-200 bg-white shadow-sm">
          <div className="border-b border-teal-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Holiday Work Requests ({pendingHW.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingHW.map((hw) => (
              <div key={hw.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    {isReviewer && hw.employee && (
                      <p className="font-medium text-gray-900">
                        {hw.employee.full_name || hw.employee.email}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                        {hw.holiday?.name ?? "Holiday"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Date:</span>{" "}
                      {formatDate(hw.holiday_date)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Hours:</span>{" "}
                      {formatTime(hw.start_time)} - {formatTime(hw.end_time)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Location:</span>{" "}
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${hw.work_location === "online" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {hw.work_location === "online" ? "Online" : "Office"}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">{hw.reason}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {isReviewer && <HolidayWorkActions requestId={hw.id} />}
                    {!isReviewer && (
                      <>
                        <BuzzManager requestId={hw.id} requestType="holiday_work" />
                        <CancelRequest requestId={hw.id} table="holiday_work_requests" />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">History</h2>
        </div>
        {pastAdj.length === 0 && pastLeave.length === 0 && pastHW.length === 0 ? (
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
                        {adj.employee.full_name || adj.employee.email}
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
                  {isReviewer && (
                    <AdjustmentActions adjustmentId={adj.id} currentStatus={adj.status} />
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
                        {leave.employee.full_name || leave.employee.email}
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
                  {isReviewer && (
                    <LeaveActions leaveId={leave.id} currentStatus={leave.status} />
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
                        {hw.employee.full_name || hw.employee.email}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatDate(hw.holiday_date)} &mdash;{" "}
                    {formatTime(hw.start_time)} - {formatTime(hw.end_time)}
                  </p>
                  {hw.reviewer_notes && (
                    <p className="text-sm text-gray-500 italic">
                      Note: {hw.reviewer_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isReviewer && (
                    <HolidayWorkActions requestId={hw.id} currentStatus={hw.status} />
                  )}
                  <StatusBadge status={hw.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${styles[status] ?? "bg-gray-100"}`}>
      {status}
    </span>
  );
}
