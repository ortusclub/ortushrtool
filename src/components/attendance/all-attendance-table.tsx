"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, ChevronLeft, ChevronRight, ChevronDown, Download, ExternalLink } from "lucide-react";
import { HOLIDAY_COUNTRY_LABELS, type HolidayCountry } from "@/types/database";
import { UserNameLink } from "@/components/shared/user-name-link";
import { displayName } from "@/lib/utils";

interface UserRow {
  id: string;
  full_name: string;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  timezone: string;
  holiday_country: HolidayCountry;
  desktime_url: string | null;
}

interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  late_minutes: number | null;
  early_departure_minutes: number | null;
  raw_response: Record<string, unknown> | null;
}

interface ScheduleRow {
  employee_id: string;
  day_of_week: number;
  work_location: string;
  is_rest_day: boolean;
  start_time: string;
  end_time: string;
}

interface AdjustmentRow {
  employee_id: string;
  requested_date: string;
  requested_work_location: string | null;
}

interface LeaveRow {
  employee_id: string;
  start_date: string;
  end_date: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dowFromDate(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  return (d.getDay() + 6) % 7; // Monday=0
}

function eachDateInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatClockTime(iso: string | null, tz: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz || "Asia/Manila",
  });
}

function getTzLabel(tz: string): string {
  if (tz === "Asia/Manila") return "PHT";
  if (tz === "Europe/Berlin") return "CET";
  if (tz === "Asia/Dubai") return "GST";
  return tz;
}

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function getCurrentTimeMinutes(tz: string): number {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  return timeToMinutes(timeStr);
}

const statusStyles: Record<string, string> = {
  on_time: "bg-green-100 text-green-700",
  late_arrival: "bg-yellow-100 text-yellow-700",
  early_departure: "bg-orange-100 text-orange-700",
  late_and_early: "bg-red-100 text-red-700",
  absent: "bg-red-100 text-red-700",
  rest_day: "bg-gray-100 text-gray-500",
  on_leave: "bg-blue-100 text-blue-700",
  holiday: "bg-purple-100 text-purple-700",
  working: "bg-green-50 text-green-600",
  not_started: "bg-slate-100 text-slate-600",
  no_schedule: "bg-gray-100 text-gray-500",
  inconclusive: "bg-amber-100 text-amber-700",
};

// Pills bundle related stored statuses (e.g. "Late" includes late_and_early).
function statusMatches(displayStatus: string, filter: string): boolean {
  if (filter === "late_any") return displayStatus === "late_arrival" || displayStatus === "late_and_early";
  if (filter === "early_any") return displayStatus === "early_departure" || displayStatus === "late_and_early";
  return displayStatus === filter;
}

const statusLabels: Record<string, string> = {
  on_time: "On Time",
  late_arrival: "Late",
  early_departure: "Early Out",
  late_and_early: "Late & Early",
  absent: "Absent",
  rest_day: "Rest Day",
  on_leave: "On Leave",
  holiday: "Holiday",
  working: "Working",
  not_started: "Shift Yet to Start",
  no_schedule: "No Schedule",
  inconclusive: "Inconclusive",
};

/**
 * Compute the real-time display status for today's data.
 * For past dates, returns the stored status as-is.
 */
function getDisplayStatus(
  log: AttendanceLog | undefined,
  tz: string,
  isToday: boolean
): string {
  if (!log) return "no_data";

  // For past dates, trust the stored status
  if (!isToday) return log.status;

  // Non-working statuses are always final
  if (["rest_day", "on_leave", "holiday", "no_schedule", "inconclusive"].includes(log.status)) {
    return log.status;
  }

  // Without a schedule we can't infer late/early/absent from the wall clock.
  if (!log.scheduled_start || !log.scheduled_end) {
    return log.clock_in ? "working" : "no_schedule";
  }

  const nowMinutes = getCurrentTimeMinutes(tz);
  const scheduledStart = timeToMinutes(log.scheduled_start.slice(0, 5));
  const scheduledEnd = timeToMinutes(log.scheduled_end.slice(0, 5));

  // No clock-in yet
  if (!log.clock_in) {
    if (nowMinutes < scheduledStart) return "not_started";
    return "absent";
  }

  // Has clocked in — check if shift is still ongoing
  if (nowMinutes < scheduledEnd) {
    // Shift not over yet: show late_arrival if they were late, otherwise "working"
    // Do NOT judge early departure yet
    if (log.status === "late_arrival" || log.status === "late_and_early") {
      return "late_arrival";
    }
    return "working";
  }

  // Shift is over — return the finalized status from the DB
  return log.status;
}

// Dropdown filter component for table headers
function HeaderFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 font-medium ${value ? "text-blue-600" : "text-gray-600"}`}
      >
        {label}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${!value ? "font-semibold text-blue-600" : "text-gray-600"}`}
            >
              All
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${value === opt.value ? "font-semibold text-blue-600" : "text-gray-600"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

interface AllAttendanceTableProps {
  users: UserRow[];
  // "search" (default) shows a search-by-name/email input.
  // "dropdown" shows a single-member dropdown — better for small teams.
  employeePicker?: "search" | "dropdown";
}

export function AllAttendanceTable({
  users,
  employeePicker = "search",
}: AllAttendanceTableProps) {
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => todayStr());
  const [toDate, setToDate] = useState<string>(() => todayStr());
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Column filters
  const [countryFilter, setCountryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tzFilter, setTzFilter] = useState("");

  // Pagination
  const [pageIndex, setPageIndex] = useState(0);

  const isSingleDate = fromDate === toDate;
  const today = todayStr();
  const isSingleDateToday = isSingleDate && fromDate === today;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // Day-of-week values that occur in the range (max 7)
    const dows = new Set<number>();
    for (const d of eachDateInRange(fromDate, toDate)) {
      dows.add(dowFromDate(d));
      if (dows.size === 7) break;
    }

    const [logsResult, schedulesResult, adjustmentsResult, leavesResult] = await Promise.all([
      supabase
        .from("attendance_logs")
        .select("*")
        .gte("date", fromDate)
        .lte("date", toDate),
      supabase
        .from("schedules")
        .select("employee_id, day_of_week, work_location, is_rest_day, start_time, end_time")
        .in("day_of_week", [...dows])
        .lte("effective_from", toDate)
        .or(`effective_until.is.null,effective_until.gte.${fromDate}`),
      supabase
        .from("schedule_adjustments")
        .select("employee_id, requested_date, requested_work_location")
        .gte("requested_date", fromDate)
        .lte("requested_date", toDate)
        .eq("status", "approved"),
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date")
        .eq("status", "approved")
        .lte("start_date", toDate)
        .gte("end_date", fromDate),
    ]);

    setLogs(logsResult.data ?? []);
    setSchedules(schedulesResult.data ?? []);
    setAdjustments(adjustmentsResult.data ?? []);
    setLeaves(leavesResult.data ?? []);
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // logs keyed by `${employee_id}|${date}`
  const logMap = useMemo(() => {
    const map = new Map<string, AttendanceLog>();
    for (const log of logs) {
      map.set(`${log.employee_id}|${log.date}`, log);
    }
    return map;
  }, [logs]);

  // base schedule keyed by `${employee_id}|${day_of_week}`
  const scheduleByEmpDow = useMemo(() => {
    const map = new Map<string, ScheduleRow>();
    for (const s of schedules) {
      map.set(`${s.employee_id}|${s.day_of_week}`, s);
    }
    return map;
  }, [schedules]);

  // approved adjustments keyed by `${employee_id}|${requested_date}`
  const adjustmentByEmpDate = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const a of adjustments) {
      map.set(`${a.employee_id}|${a.requested_date}`, a.requested_work_location);
    }
    return map;
  }, [adjustments]);

  // expand each leave into its individual covered dates within the range
  const onLeaveByEmpDate = useMemo(() => {
    const set = new Set<string>();
    for (const lv of leaves) {
      const start = lv.start_date < fromDate ? fromDate : lv.start_date;
      const end = lv.end_date > toDate ? toDate : lv.end_date;
      for (const d of eachDateInRange(start, end)) {
        set.add(`${lv.employee_id}|${d}`);
      }
    }
    return set;
  }, [leaves, fromDate, toDate]);

  function getLocation(userId: string, date: string, status: string): string | null {
    if (["rest_day", "on_leave", "holiday"].includes(status)) return null;
    const adjLocation = adjustmentByEmpDate.get(`${userId}|${date}`);
    if (adjLocation) return adjLocation;
    const sched = scheduleByEmpDow.get(`${userId}|${dowFromDate(date)}`);
    return sched && !sched.is_rest_day ? sched.work_location : null;
  }

  function getScheduleTimes(userId: string, date: string): { start: string; end: string } | null {
    const sched = scheduleByEmpDow.get(`${userId}|${dowFromDate(date)}`);
    if (sched && !sched.is_rest_day && sched.start_time && sched.end_time) {
      return { start: sched.start_time, end: sched.end_time };
    }
    return null;
  }

  // Derive unique filter options from the data
  const countryOptions = useMemo(() => {
    const countries = new Set(users.map((u) => u.holiday_country));
    return [...countries].sort().map((c) => ({
      value: c,
      label: HOLIDAY_COUNTRY_LABELS[c] ?? c,
    }));
  }, [users]);

  const tzOptions = useMemo(() => {
    const tzs = new Set(users.map((u) => u.timezone || "Asia/Manila"));
    return [...tzs].sort().map((tz) => ({
      value: tz,
      label: getTzLabel(tz),
    }));
  }, [users]);

  const locationOptions = [
    { value: "office", label: "Office" },
    { value: "online", label: "Online" },
  ];

  const userById = useMemo(() => {
    const map = new Map<string, UserRow>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  // Build the raw row set: in single-date mode show every user (including
  // no_data). In range mode, show only existing logs.
  const rawRows = useMemo(() => {
    if (isSingleDate) {
      return users.map((user) => ({
        user,
        log: logMap.get(`${user.id}|${fromDate}`),
        date: fromDate,
      }));
    }
    const out: { user: UserRow; log: AttendanceLog | undefined; date: string }[] = [];
    for (const log of logs) {
      const user = userById.get(log.employee_id);
      if (!user) continue;
      out.push({ user, log, date: log.date });
    }
    out.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        displayName(a.user).localeCompare(displayName(b.user))
    );
    return out;
  }, [isSingleDate, users, userById, logMap, logs, fromDate]);

  function rowDisplayStatus(row: { user: UserRow; log: AttendanceLog | undefined; date: string }): string {
    const tz = row.user.timezone || "Asia/Manila";
    const raw = getDisplayStatus(row.log, tz, row.date === today);
    if (
      onLeaveByEmpDate.has(`${row.user.id}|${row.date}`) &&
      !["on_leave", "holiday", "rest_day"].includes(raw)
    ) {
      return "on_leave";
    }
    return raw;
  }

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    for (const r of rawRows) statuses.add(rowDisplayStatus(r));
    return [...statuses]
      .filter((s) => s !== "no_data")
      .sort()
      .map((s) => ({ value: s, label: statusLabels[s] ?? s }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, onLeaveByEmpDate]);

  const filteredRows = useMemo(() => {
    let result = rawRows;

    if (employeePicker === "search" && search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          displayName(r.user).toLowerCase().includes(q) ||
          r.user.full_name.toLowerCase().includes(q) ||
          r.user.email.toLowerCase().includes(q)
      );
    } else if (employeePicker === "dropdown" && selectedEmployeeId) {
      result = result.filter((r) => r.user.id === selectedEmployeeId);
    }

    if (countryFilter) {
      result = result.filter((r) => r.user.holiday_country === countryFilter);
    }

    if (tzFilter) {
      result = result.filter(
        (r) => (r.user.timezone || "Asia/Manila") === tzFilter
      );
    }

    if (statusFilter) {
      result = result.filter((r) => statusMatches(rowDisplayStatus(r), statusFilter));
    }

    if (locationFilter) {
      result = result.filter((r) => {
        const ds = rowDisplayStatus(r);
        return getLocation(r.user.id, r.date, ds) === locationFilter;
      });
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, employeePicker, search, selectedEmployeeId, countryFilter, tzFilter, statusFilter, locationFilter, onLeaveByEmpDate, scheduleByEmpDow, adjustmentByEmpDate]);

  // Reset to page 1 when filters / dates change
  useEffect(() => {
    setPageIndex(0);
  }, [search, selectedEmployeeId, countryFilter, locationFilter, statusFilter, tzFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const visibleRows = filteredRows.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE
  );

  const goDay = (offset: number) => {
    setFromDate((f) => shiftDate(f, offset));
    setToDate((t) => shiftDate(t, offset));
  };
  const resetToToday = () => {
    setFromDate(today);
    setToDate(today);
  };

  // Stats from filtered rows
  const stats = useMemo(() => {
    let onTime = 0, late = 0, early = 0, absent = 0, noData = 0,
      onLeave = 0, holiday = 0, working = 0, notStarted = 0, inconclusive = 0;
    for (const r of filteredRows) {
      const ds = rowDisplayStatus(r);
      if (ds === "on_time") onTime++;
      else if (ds === "late_arrival") late++;
      else if (ds === "early_departure") early++;
      else if (ds === "late_and_early") { late++; early++; }
      else if (ds === "absent") absent++;
      else if (ds === "on_leave") onLeave++;
      else if (ds === "holiday") holiday++;
      else if (ds === "working") working++;
      else if (ds === "not_started") notStarted++;
      else if (ds === "inconclusive") inconclusive++;
      else noData++;
    }
    return { onTime, late, early, absent, noData, onLeave, holiday, working, notStarted, inconclusive };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, onLeaveByEmpDate]);

  const hasActiveFilters = countryFilter || locationFilter || statusFilter || tzFilter;

  const exportCSV = () => {
    const headers = [
      "Employee",
      "Email",
      ...(isSingleDate ? [] : ["Date"]),
      "Country",
      "Location",
      "Schedule",
      "Timezone",
      "Clock In",
      "Clock Out",
      "Status",
      "Late (min)",
      "Early Out (min)",
      "DeskTime (s)",
      "Productive (s)",
    ];
    const rows = filteredRows.map((r) => {
      const { user, log, date } = r;
      const tz = user.timezone || "Asia/Manila";
      const raw = log?.raw_response as Record<string, unknown> | null;
      const desktimeSeconds = raw?.desktimeTime as number | undefined;
      const productiveSeconds = raw?.productiveTime as number | undefined;
      const ds = rowDisplayStatus(r);
      const location = getLocation(user.id, date, ds);
      const schedTimes = getScheduleTimes(user.id, date);
      const schedule =
        log?.scheduled_start && log?.scheduled_end
          ? `${log.scheduled_start.slice(0, 5)} - ${log.scheduled_end.slice(0, 5)}`
          : schedTimes
            ? `${schedTimes.start.slice(0, 5)} - ${schedTimes.end.slice(0, 5)}`
            : "";
      const cells: (string | number)[] = [
        user.full_name || user.email.split("@")[0],
        user.email,
      ];
      if (!isSingleDate) cells.push(date);
      cells.push(
        HOLIDAY_COUNTRY_LABELS[user.holiday_country] ?? user.holiday_country,
        location ?? "",
        schedule,
        getTzLabel(tz),
        log ? formatClockTime(log.clock_in, tz) : "",
        log ? formatClockTime(log.clock_out, tz) : "",
        ds === "no_data" ? "" : (statusLabels[ds] ?? ds),
        log?.late_minutes ?? "",
        log?.early_departure_minutes ?? "",
        desktimeSeconds ?? "",
        productiveSeconds ?? ""
      );
      return cells;
    });

    const escape = (cell: string | number) => {
      const s = String(cell);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = isSingleDate
      ? `attendance-${fromDate}.csv`
      : `attendance-${fromDate}_to_${toDate}.csv`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Date navigation & search */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex-1 min-w-[200px]">
          {employeePicker === "search" ? (
            <>
              <label className="block text-xs font-medium text-gray-600">
                Search
              </label>
              <div className="relative mt-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Filter by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-gray-600">
                Team Member
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All members</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {displayName(u)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setCountryFilter(""); setLocationFilter(""); setStatusFilter(""); setTzFilter(""); }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Clear filters
            </button>
          )}
          <button
            type="button"
            onClick={exportCSV}
            disabled={filteredRows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          >
            <Download size={14} />
            CSV
          </button>
          <button
            type="button"
            onClick={() => goDay(-1)}
            className="relative z-10 rounded-lg border border-gray-300 p-2.5 hover:bg-gray-100 active:bg-gray-200"
            title="Shift dates back one day"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm [&::-webkit-calendar-picker-indicator]:opacity-50"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm [&::-webkit-calendar-picker-indicator]:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={() => goDay(1)}
            className="relative z-10 rounded-lg border border-gray-300 p-2.5 hover:bg-gray-100 active:bg-gray-200"
            title="Shift dates forward one day"
          >
            <ChevronRight size={18} />
          </button>
          {(fromDate !== today || toDate !== today) && (
            <button
              type="button"
              onClick={resetToToday}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Date display & stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isSingleDate
            ? formatDisplayDate(fromDate)
            : `${formatDisplayDate(fromDate)} → ${formatDisplayDate(toDate)}`}
        </h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {([
            { key: "on_time", label: "On Time", count: stats.onTime, classes: "bg-green-100 text-green-700", ringClass: "ring-green-400", alwaysShow: true },
            { key: "late_any", label: "Late", count: stats.late, classes: "bg-yellow-100 text-yellow-700", ringClass: "ring-yellow-400", alwaysShow: true },
            { key: "early_any", label: "Early Out", count: stats.early, classes: "bg-orange-100 text-orange-700", ringClass: "ring-orange-400", alwaysShow: true },
            { key: "absent", label: "Absent", count: stats.absent, classes: "bg-red-100 text-red-700", ringClass: "ring-red-400", alwaysShow: true },
            { key: "working", label: "Working", count: stats.working, classes: "bg-green-50 text-green-600", ringClass: "ring-green-300", alwaysShow: false },
            { key: "not_started", label: "Shift Yet to Start", count: stats.notStarted, classes: "bg-slate-100 text-slate-600", ringClass: "ring-slate-400", alwaysShow: false },
            { key: "on_leave", label: "On Leave", count: stats.onLeave, classes: "bg-blue-100 text-blue-700", ringClass: "ring-blue-400", alwaysShow: false },
            { key: "holiday", label: "Holiday", count: stats.holiday, classes: "bg-purple-100 text-purple-700", ringClass: "ring-purple-400", alwaysShow: false },
            { key: "inconclusive", label: "Inconclusive", count: stats.inconclusive, classes: "bg-amber-100 text-amber-700", ringClass: "ring-amber-400", alwaysShow: false },
            { key: "no_data", label: "No Data", count: stats.noData, classes: "bg-gray-100 text-gray-500", ringClass: "ring-gray-400", alwaysShow: false },
          ] as const).map((p) => {
            if (!p.alwaysShow && p.count === 0) return null;
            const active = statusFilter === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setStatusFilter(active ? "" : p.key)}
                className={`rounded-full px-3 py-1 font-medium transition ${p.classes} ${active ? `ring-2 ring-offset-1 ${p.ringClass}` : "hover:opacity-80"}`}
              >
                {p.count} {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Preferred Name</th>
                <th className="px-4 py-3 font-medium text-gray-600">DeskTime URL</th>
                {!isSingleDate && (
                  <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                )}
                <th className="px-4 py-3">
                  <HeaderFilter label="Country" options={countryOptions} value={countryFilter} onChange={setCountryFilter} />
                </th>
                <th className="px-4 py-3">
                  <HeaderFilter label="Location" options={locationOptions} value={locationFilter} onChange={setLocationFilter} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Schedule</th>
                <th className="px-4 py-3">
                  <HeaderFilter label="TZ" options={tzOptions} value={tzFilter} onChange={setTzFilter} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Clock In</th>
                <th className="px-4 py-3 font-medium text-gray-600">Clock Out</th>
                <th className="px-4 py-3">
                  <HeaderFilter label="Status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Late</th>
                <th className="px-4 py-3 font-medium text-gray-600">Early Out</th>
                <th className="px-4 py-3 font-medium text-gray-600">DeskTime</th>
                <th className="px-4 py-3 font-medium text-gray-600">Productive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.map((r) => {
                const { user, log, date } = r;
                const tz = user.timezone || "Asia/Manila";
                const raw = log?.raw_response as Record<string, unknown> | null;
                const desktimeSeconds = raw?.desktimeTime as number | undefined;
                const productiveSeconds = raw?.productiveTime as number | undefined;
                const isRowToday = date === today;
                const ds = rowDisplayStatus(r);
                const location = getLocation(user.id, date, ds);
                const schedTimes = getScheduleTimes(user.id, date);

                return (
                  <tr key={`${user.id}|${date}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <UserNameLink
                        userId={user.id}
                        name={displayName(user)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {user.desktime_url ? (
                        <a
                          href={user.desktime_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          Open
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    {!isSingleDate && (
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {date}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {HOLIDAY_COUNTRY_LABELS[user.holiday_country] ?? user.holiday_country}
                    </td>
                    <td className="px-4 py-3">
                      {location ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                            location === "office"
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-teal-50 text-teal-700"
                          }`}
                        >
                          {location === "office" ? "Office" : "Online"}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log?.scheduled_start && log?.scheduled_end
                        ? `${log.scheduled_start.slice(0, 5)} - ${log.scheduled_end.slice(0, 5)}`
                        : schedTimes
                          ? `${schedTimes.start.slice(0, 5)} - ${schedTimes.end.slice(0, 5)}`
                          : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {getTzLabel(tz)}
                    </td>
                    <td className="px-4 py-3">
                      {ds === "inconclusive" ? (
                        <span className="text-amber-600" title="Multiple sessions detected — actual start time is uncertain">?</span>
                      ) : log ? (
                        formatClockTime(log.clock_in, tz)
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        if (!log?.clock_out) return "-";
                        if (!isRowToday) return formatClockTime(log.clock_out, tz);
                        const msSinceLastActive = Date.now() - new Date(log.clock_out).getTime();
                        const inactiveOver1h = msSinceLastActive > 60 * 60 * 1000;
                        if (inactiveOver1h) return <span className="text-orange-500">{formatClockTime(log.clock_out, tz)}</span>;
                        return "-";
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {ds !== "no_data" ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusStyles[ds] ?? "bg-gray-100"}`}
                        >
                          {statusLabels[ds] ?? ds}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-yellow-600">
                      {log?.late_minutes ? `${log.late_minutes}m` : "-"}
                    </td>
                    <td className="px-4 py-3 text-orange-600">
                      {(() => {
                        if (isRowToday && log?.scheduled_end) {
                          const scheduledEnd = timeToMinutes(log.scheduled_end.slice(0, 5));
                          const nowMinutes = getCurrentTimeMinutes(tz);
                          if (nowMinutes < scheduledEnd) return "-";
                        }
                        return log?.early_departure_minutes
                          ? `${log.early_departure_minutes}m`
                          : "-";
                      })()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDuration(desktimeSeconds)}
                    </td>
                    <td className="px-4 py-3 text-green-700">
                      {formatDuration(productiveSeconds)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {filteredRows.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
          <span>
            Showing{" "}
            <strong>{safePageIndex * PAGE_SIZE + 1}</strong>
            {"–"}
            <strong>
              {Math.min((safePageIndex + 1) * PAGE_SIZE, filteredRows.length)}
            </strong>{" "}
            of <strong>{filteredRows.length}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={safePageIndex === 0}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">
              Page {safePageIndex + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePageIndex >= totalPages - 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
