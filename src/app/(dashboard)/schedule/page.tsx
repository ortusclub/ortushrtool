import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { DAYS_OF_WEEK, LEAVE_TYPE_LABELS } from "@/lib/constants";
import { formatTime, formatDate, cn, hasNightDifferentialHours } from "@/lib/utils";
import { NightDiffNote } from "@/components/shared/night-diff-note";
import type { Schedule } from "@/types/database";
import { HOLIDAY_COUNTRY_LABELS } from "@/types/database";
import Link from "next/link";
import { startOfWeek, addDays, format, isSameDay, parseISO } from "date-fns";

export default async function SchedulePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: schedules } = await supabase
    .from("schedules")
    .select("*")
    .eq("employee_id", user.id)
    .lte("effective_from", today)
    .or(`effective_until.is.null,effective_until.gte.${today}`)
    .order("day_of_week", { ascending: true });

  // Get upcoming approved adjustments
  const { data: adjustments } = await supabase
    .from("schedule_adjustments")
    .select("*")
    .eq("employee_id", user.id)
    .eq("status", "approved")
    .gte("requested_date", today)
    .order("requested_date", { ascending: true })
    .limit(20);

  // Get upcoming approved leave
  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("employee_id", user.id)
    .eq("status", "approved")
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .limit(10);

  // This week's data
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const weekStartStr = format(weekDates[0], "yyyy-MM-dd");
  const weekEndStr = format(weekDates[4], "yyyy-MM-dd");

  // Adjustments for this week
  const { data: weekAdjustments } = await supabase
    .from("schedule_adjustments")
    .select("*")
    .eq("employee_id", user.id)
    .eq("status", "approved")
    .gte("requested_date", weekStartStr)
    .lte("requested_date", weekEndStr);

  const adjByDate = new Map(
    (weekAdjustments ?? []).map((a) => [a.requested_date, a])
  );

  // Leaves covering this week
  const { data: weekLeaves } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("employee_id", user.id)
    .eq("status", "approved")
    .lte("start_date", weekEndStr)
    .gte("end_date", weekStartStr);

  // Holiday work for this week
  const { data: weekHolidayWork } = await supabase
    .from("holiday_work_requests")
    .select("*")
    .eq("employee_id", user.id)
    .eq("status", "approved")
    .gte("holiday_date", weekStartStr)
    .lte("holiday_date", weekEndStr);

  const hwByDate = new Map(
    (weekHolidayWork ?? []).map((hw) => [hw.holiday_date, hw])
  );

  // Holidays
  const { data: holidays } = await supabase
    .from("holidays")
    .select("*");

  const scheduleByDay = new Map<number, Schedule>();
  (schedules ?? []).forEach((s) => {
    scheduleByDay.set(s.day_of_week, s as Schedule);
  });

  // Build holiday lookup for this week
  const holidayByDate = new Map<string, string>();
  for (const h of holidays ?? []) {
    if (h.country !== user.holiday_country) continue;
    const hDate = parseISO(h.date);
    for (const wd of weekDates) {
      const matches = h.is_recurring
        ? hDate.getMonth() === wd.getMonth() && hDate.getDate() === wd.getDate()
        : isSameDay(hDate, wd);
      if (matches) {
        holidayByDate.set(format(wd, "yyyy-MM-dd"), h.name);
      }
    }
  }

  // Build this week's schedule
  function getWeekDayInfo(date: Date, dayIndex: number) {
    const dateStr = format(date, "yyyy-MM-dd");
    const schedule = scheduleByDay.get(dayIndex);

    // Holiday
    const holidayName = holidayByDate.get(dateStr);
    if (holidayName) {
      const hw = hwByDate.get(dateStr);
      if (hw) {
        return {
          type: "holiday_work" as const,
          time: `${formatTime(hw.start_time)} - ${formatTime(hw.end_time)}`,
          location: hw.work_location,
          note: `Working on ${holidayName}`,
          startTime: hw.start_time,
          endTime: hw.end_time,
        };
      }
      return { type: "holiday" as const, label: holidayName };
    }

    // Leave
    for (const l of weekLeaves ?? []) {
      if (dateStr >= l.start_date && dateStr <= l.end_date) {
        const typeLabel = l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1);
        return { type: "leave" as const, label: `${typeLabel} Leave` };
      }
    }

    // Adjustment
    const adj = adjByDate.get(dateStr);
    if (schedule?.is_rest_day && !adj) {
      return { type: "rest" as const };
    }

    if (adj) {
      return {
        type: "adjusted" as const,
        time: `${formatTime(adj.requested_start_time)} - ${formatTime(adj.requested_end_time)}`,
        location: adj.requested_work_location ?? schedule?.work_location ?? null,
        startTime: adj.requested_start_time,
        endTime: adj.requested_end_time,
      };
    }

    // Base schedule
    if (schedule && !schedule.is_rest_day) {
      return {
        type: "schedule" as const,
        time: `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
        location: schedule.work_location,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
      };
    }

    if (schedule?.is_rest_day) {
      return { type: "rest" as const };
    }

    return { type: "none" as const };
  }

  const isToday = (date: Date) => isSameDay(date, now);

  const leaveTypeLabels = LEAVE_TYPE_LABELS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
          <p className="text-gray-600">Your current weekly schedule</p>
        </div>
        <Link
          href="/requests"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Make a Request
        </Link>
      </div>

      {/* Base schedule */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Base Schedule
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          {DAYS_OF_WEEK.map((day, index) => {
            const schedule = scheduleByDay.get(index);
            const isRestDay = schedule?.is_rest_day ?? (index >= 5);

            return (
              <div
                key={day}
                className={`rounded-xl border p-4 ${
                  isRestDay
                    ? "border-gray-200 bg-gray-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <h3 className="text-sm font-semibold text-gray-900">{day}</h3>
                {isRestDay ? (
                  <p className="mt-2 text-sm text-gray-500">Rest Day</p>
                ) : schedule ? (
                  <div className="mt-2 space-y-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        schedule.work_location === "office"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {schedule.work_location === "office" ? "Office" : "Online"}
                    </span>
                    <p className="text-sm text-gray-700">
                      {formatTime(schedule.start_time)}
                    </p>
                    <p className="text-xs text-gray-500">to</p>
                    <p className="text-sm text-gray-700">
                      {formatTime(schedule.end_time)}
                    </p>
                    {hasNightDifferentialHours(schedule.start_time, schedule.end_time) && (
                      <NightDiffNote size="xs" />
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-400">Not set</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* This week's schedule */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          This Week&apos;s Schedule
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {weekDates.map((date, i) => {
            const info = getWeekDayInfo(date, i);
            const todayHighlight = isToday(date);

            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border p-4",
                  todayHighlight
                    ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                    : "border-gray-200 bg-white"
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {format(date, "EEEE")}
                  </h3>
                  {todayHighlight && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                      Today
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{format(date, "MMM d")}</p>

                <div className="mt-3">
                  {info.type === "schedule" && (
                    <div className="space-y-1">
                      {"location" in info && info.location && (
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            info.location === "office"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          )}
                        >
                          {info.location === "office" ? "Office" : "Online"}
                        </span>
                      )}
                      <p className="text-sm text-gray-700">{"time" in info && info.time}</p>
                      {"startTime" in info && hasNightDifferentialHours(info.startTime, info.endTime) && (
                        <NightDiffNote size="xs" />
                      )}
                    </div>
                  )}

                  {info.type === "adjusted" && (
                    <div className="space-y-1">
                      {"location" in info && info.location && (
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            info.location === "office"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          )}
                        >
                          {info.location === "office" ? "Office" : "Online"}
                        </span>
                      )}
                      <p className="text-sm text-gray-700">{"time" in info && info.time}</p>
                      {"startTime" in info && hasNightDifferentialHours(info.startTime, info.endTime) && (
                        <NightDiffNote size="xs" />
                      )}
                      <span className="inline-block rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">
                        Adjusted
                      </span>
                    </div>
                  )}

                  {info.type === "holiday_work" && (
                    <div className="space-y-1">
                      {"location" in info && info.location && (
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            info.location === "office"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          )}
                        >
                          {info.location === "office" ? "Office" : "Online"}
                        </span>
                      )}
                      <p className="text-sm text-gray-700">{"time" in info && info.time}</p>
                      {"startTime" in info && hasNightDifferentialHours(info.startTime, info.endTime) && (
                        <NightDiffNote size="xs" />
                      )}
                      <span className="inline-block rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                        {"note" in info && info.note}
                      </span>
                    </div>
                  )}

                  {info.type === "holiday" && (
                    <span className="inline-block rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700">
                      {"label" in info && info.label}
                    </span>
                  )}

                  {info.type === "leave" && (
                    <span className="inline-block rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                      {"label" in info && info.label}
                    </span>
                  )}

                  {info.type === "rest" && (
                    <p className="text-sm text-gray-400">Rest Day</p>
                  )}

                  {info.type === "none" && (
                    <p className="text-sm text-gray-300">&mdash;</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming adjustments */}
      {adjustments && adjustments.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Adjustments
          </h2>
          <div className="rounded-xl border border-blue-200 bg-white shadow-sm">
            <div className="divide-y divide-gray-100">
              {adjustments.map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-center justify-between p-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-gray-900">
                      {adj.requested_date === "9999-12-31"
                        ? "Permanent Change"
                        : formatDate(adj.requested_date)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatTime(adj.requested_start_time)} -{" "}
                      {formatTime(adj.requested_end_time)}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Adjusted
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upcoming leave */}
      {leaves && leaves.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Leave
          </h2>
          <div className="rounded-xl border border-purple-200 bg-white shadow-sm">
            <div className="divide-y divide-gray-100">
              {leaves.map((leave) => (
                <div
                  key={leave.id}
                  className="flex items-center justify-between p-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(leave.start_date)} &mdash;{" "}
                      {formatDate(leave.end_date)}
                    </p>
                    <p className="text-sm text-gray-600">{leave.reason}</p>
                  </div>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                    {leaveTypeLabels[leave.leave_type] ?? leave.leave_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
