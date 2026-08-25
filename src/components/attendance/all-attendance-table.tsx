"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { attendanceDate } from "@/lib/biometric/parse";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { Search, ChevronLeft, ChevronRight, Download, ExternalLink, Flag } from "lucide-react";
import { HOLIDAY_COUNTRY_LABELS, type HolidayCountry } from "@/types/database";
import { UserNameLink } from "@/components/shared/user-name-link";
import { displayName, hasNightDifferentialHours } from "@/lib/utils";
import { HeaderFilter } from "@/components/shared/header-filter";
import { SortButton, type SortDir } from "@/components/shared/sort-button";
import { NightDiffNote } from "@/components/shared/night-diff-note";

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
  job_title: string | null;
  subdepartment: string | null;
  manager: {
    id: string;
    full_name: string;
    preferred_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
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
  const cur = new Date(from + "T12:00:00");
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

const PAGE_SIZE = 50;

interface AllAttendanceTableProps {
  users: UserRow[];
  /** system_settings.shift_cutoff_hour — punches before it belong to the
   *  previous day's shift, matching desktime-sync. */
  shiftCutoffHour?: number;
  // "search" (default) shows a search-by-name/email input.
  // "dropdown" shows a single-member dropdown — better for small teams.
  employeePicker?: "search" | "dropdown";
}

export function AllAttendanceTable({
  users,
  employeePicker = "search",
  shiftCutoffHour = 5,
}: AllAttendanceTableProps) {
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => todayStr());
  const [toDate, setToDate] = useState<string>(() => todayStr());
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  // Set of `${employee_id}|YYYY-MM-DD` for every biometric punch in the
  // range, keyed by the WORKING day (shift_cutoff_hour applied). This drives
  // the Actual Location column and nothing else: clock in/out, lateness and
  // status all come from DeskTime, so the two sources stay independent.
  const [biometricPresence, setBiometricPresence] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Column filters
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set());
  const [locationFilter, setLocationFilter] = useState<Set<string>>(new Set());
  const [actualLocationFilter, setActualLocationFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [tzFilter, setTzFilter] = useState<Set<string>>(new Set());
  const [subdeptFilter, setSubdeptFilter] = useState<Set<string>>(new Set());

  type SortColumn =
    | "name"
    | "date"
    | "clock_in"
    | "clock_out"
    | "late"
    | "early";
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir } | null>(
    null
  );
  const toggleSort = (column: SortColumn) =>
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, dir: "asc" };
      if (prev.dir === "asc") return { column, dir: "desc" };
      return null;
    });
  const sortDir = (col: SortColumn) => (sort?.column === col ? sort.dir : null);

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

    // Biometric punches are stored in UTC but represent Asia/Manila local
    // time. Extend the SQL range by ±1 day to account for the offset, then
    // bucket each punch into its Manila-local date below.
    const punchFrom = `${fromDate}T00:00:00+08:00`;
    const punchTo = `${toDate}T23:59:59.999+08:00`;

    // Each of these can exceed PostgREST's 1000-row cap over a wide date
    // range (e.g. attendance_logs = days × employees), so page through them
    // all instead of relying on a single truncated request. Order by id for
    // stable paging windows.
    const [logsData, schedulesData, adjustmentsData, leavesData, punchesData] =
      await Promise.all([
        fetchAllRows<AttendanceLog>((from, to) =>
          supabase
            .from("attendance_logs")
            .select("*")
            .gte("date", fromDate)
            .lte("date", toDate)
            .order("id")
            .range(from, to)
        ),
        fetchAllRows<ScheduleRow>((from, to) =>
          supabase
            .from("schedules")
            .select("employee_id, day_of_week, work_location, is_rest_day, start_time, end_time")
            .in("day_of_week", [...dows])
            .lte("effective_from", toDate)
            .or(`effective_until.is.null,effective_until.gte.${fromDate}`)
            .order("id")
            .range(from, to)
        ),
        fetchAllRows<AdjustmentRow>((from, to) =>
          supabase
            .from("schedule_adjustments")
            .select("employee_id, requested_date, requested_work_location")
            .gte("requested_date", fromDate)
            .lte("requested_date", toDate)
            .eq("status", "approved")
            // Oldest first so the most recent approved adjustment wins per
            // date; id breaks ties for stable paging.
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<LeaveRow>((from, to) =>
          supabase
            .from("leave_requests")
            .select("employee_id, start_date, end_date")
            .eq("status", "approved")
            .lte("start_date", toDate)
            .gte("end_date", fromDate)
            .order("id")
            .range(from, to)
        ),
        fetchAllRows<{ employee_id: string; punch_time: string }>((from, to) =>
          supabase
            .from("biometric_punches")
            .select("employee_id, punch_time")
            .gte("punch_time", punchFrom)
            .lte("punch_time", punchTo)
            .order("id")
            .range(from, to)
        ),
      ]);

    setLogs(logsData);
    setSchedules(schedulesData);
    setAdjustments(adjustmentsData);
    setLeaves(leavesData);

    // Bucket each punch into the WORKING day it belongs to, not its raw
    // calendar date: the scanner is the office door, so a night shift leaves
    // exit taps in the small hours of the next date, which would otherwise
    // read as office attendance on a day the person never worked.
    const presence = new Set<string>();
    for (const p of punchesData) {
      presence.add(`${p.employee_id}|${attendanceDate(p.punch_time, shiftCutoffHour)}`);
    }
    setBiometricPresence(presence);
    setLoading(false);
  }, [fromDate, toDate, shiftCutoffHour]);

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

  /**
   * Where someone actually was: "office" if the door scanner saw them,
   * "online" if DeskTime recorded activity, otherwise null.
   *
   * Non-working days return null regardless of either signal. Someone on
   * leave who answers a message, or who drops by the office to collect
   * something, is still on leave — reporting them as Online/Office made the
   * day look like attendance and put a spurious mismatch flag against a
   * planned location that doesn't exist for that day.
   */
  function getActualLocation(
    userId: string,
    date: string,
    status: string,
    log: AttendanceLog | undefined
  ): "office" | "online" | null {
    if (["rest_day", "on_leave", "holiday"].includes(status)) return null;
    if (biometricPresence.has(`${userId}|${date}`)) return "office";
    if (log?.clock_in || log?.clock_out) return "online";
    return null;
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

  const subdeptOptions = useMemo(() => {
    const subs = new Set(
      users.map((u) => u.subdepartment).filter((s): s is string => !!s)
    );
    return [...subs].sort().map((s) => ({ value: s, label: s }));
  }, [users]);

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
    // Someone can be in the office with no DeskTime log at all — staff who
    // have no DeskTime seat produce zero logs, so building rows from logs
    // alone made them invisible despite badging in every day. Add a row for
    // any day they were physically present; it carries no clock in/out
    // (DeskTime owns those) but shows the Office location.
    const seen = new Set(out.map((r) => `${r.user.id}|${r.date}`));
    for (const key of biometricPresence) {
      if (seen.has(key)) continue;
      const [employeeId, date] = key.split("|");
      if (date < fromDate || date > toDate) continue;
      const user = userById.get(employeeId);
      if (!user) continue;
      out.push({ user, log: undefined, date });
    }
    out.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        displayName(a.user).localeCompare(displayName(b.user))
    );
    return out;
  }, [isSingleDate, users, userById, logMap, logs, fromDate, toDate, biometricPresence]);

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

    if (countryFilter.size > 0) {
      result = result.filter((r) => countryFilter.has(r.user.holiday_country));
    }

    if (tzFilter.size > 0) {
      result = result.filter((r) =>
        tzFilter.has(r.user.timezone || "Asia/Manila")
      );
    }

    if (subdeptFilter.size > 0) {
      result = result.filter(
        (r) => r.user.subdepartment != null && subdeptFilter.has(r.user.subdepartment)
      );
    }

    if (statusFilter.size > 0) {
      result = result.filter((r) => {
        const ds = rowDisplayStatus(r);
        for (const f of statusFilter) if (statusMatches(ds, f)) return true;
        return false;
      });
    }

    if (locationFilter.size > 0) {
      result = result.filter((r) => {
        const ds = rowDisplayStatus(r);
        const loc = getLocation(r.user.id, r.date, ds);
        return loc != null && locationFilter.has(loc);
      });
    }

    if (actualLocationFilter.size > 0) {
      result = result.filter((r) => {
        const actual =
          getActualLocation(r.user.id, r.date, rowDisplayStatus(r), r.log) ?? "none";
        return actualLocationFilter.has(actual);
      });
    }

    if (sort) {
      const cmp = (a: number | string, b: number | string) => {
        if (a < b) return sort.dir === "asc" ? -1 : 1;
        if (a > b) return sort.dir === "asc" ? 1 : -1;
        return 0;
      };
      const key = (r: typeof result[number]): number | string => {
        const eff = r.log;
        switch (sort.column) {
          case "name":
            return displayName(r.user).toLowerCase();
          case "date":
            return r.date;
          case "clock_in":
            return eff?.clock_in ?? "";
          case "clock_out":
            return eff?.clock_out ?? "";
          case "late":
            return eff?.late_minutes ?? -1;
          case "early":
            return eff?.early_departure_minutes ?? -1;
        }
      };
      result = [...result].sort((a, b) => cmp(key(a), key(b)));
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, employeePicker, search, selectedEmployeeId, countryFilter, tzFilter, subdeptFilter, statusFilter, locationFilter, actualLocationFilter, biometricPresence, sort, onLeaveByEmpDate, scheduleByEmpDow, adjustmentByEmpDate]);

  // Reset to page 1 when filters / dates change
  useEffect(() => {
    setPageIndex(0);
  }, [search, selectedEmployeeId, countryFilter, locationFilter, actualLocationFilter, statusFilter, tzFilter, subdeptFilter, fromDate, toDate]);

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

  /**
   * Office attendance is deliberately NOT derived from filteredRows.
   *
   * "9 of 12 expected came in" only means something against a fixed
   * population. If the status or subdepartment filters narrowed it too, the
   * denominator would move with every click and the percentage would quietly
   * describe a different group each time. Country is the one filter that
   * defines a real population (the scanner is Manila-only), so it is the one
   * filter this responds to.
   */
  const officeStats = useMemo(() => {
    let expected = 0, actual = 0, noShow = 0, unplanned = 0;
    for (const r of rawRows) {
      if (countryFilter.size > 0 && !countryFilter.has(r.user.holiday_country)) continue;
      const ds = rowDisplayStatus(r);
      const planned = getLocation(r.user.id, r.date, ds);
      const was = getActualLocation(r.user.id, r.date, ds, r.log);
      if (planned === "office") expected++;
      if (was === "office") actual++;
      if (planned === "office" && was !== "office") noShow++;
      if (was === "office" && planned !== "office") unplanned++;
    }
    return { expected, actual, noShow, unplanned };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, countryFilter, biometricPresence, onLeaveByEmpDate, scheduleByEmpDow, adjustmentByEmpDate]);

  const hasActiveFilters =
    countryFilter.size > 0 ||
    locationFilter.size > 0 ||
    actualLocationFilter.size > 0 ||
    statusFilter.size > 0 ||
    tzFilter.size > 0 ||
    subdeptFilter.size > 0;

  const exportCSV = () => {
    const headers = [
      "Employee",
      "Email",
      "Job Title",
      "Subdepartment",
      ...(employeePicker !== "dropdown" ? ["Manager"] : []),
      ...(isSingleDate ? [] : ["Date"]),
      "Country",
      "Working Location",
      "Actual Location",
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
      const { user, date } = r;
      const log = r.log;
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
        user.job_title ?? "",
        user.subdepartment ?? "",
      ];
      if (employeePicker !== "dropdown") {
        cells.push(user.manager ? displayName(user.manager) : "");
      }
      if (!isSingleDate) cells.push(date);
      const actualLoc = getActualLocation(user.id, date, ds, log);
      const actualLocation = actualLoc === "office" ? "Office" : actualLoc === "online" ? "Online" : "";
      cells.push(
        HOLIDAY_COUNTRY_LABELS[user.holiday_country] ?? user.holiday_country,
        location ?? "",
        actualLocation,
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
              onClick={() => { setCountryFilter(new Set()); setLocationFilter(new Set()); setActualLocationFilter(new Set()); setStatusFilter(new Set()); setTzFilter(new Set()); setSubdeptFilter(new Set()); }}
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
            return (
              <span
                key={p.key}
                className={`rounded-full px-3 py-1 font-medium ${p.classes}`}
              >
                {p.count} {p.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Office attendance: planned vs what the scanner actually saw. Driven
          by the country filter alone — see the officeStats memo for why the
          other filters must not move these numbers. */}
      {countryFilter.size > 0 && (officeStats.expected > 0 || officeStats.actual > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm">
          <span className="font-medium text-indigo-900">Office attendance</span>
          <span className="text-indigo-800">
            <span className="font-semibold">{officeStats.expected}</span> expected
          </span>
          <span className="text-indigo-800">
            <span className="font-semibold">{officeStats.actual}</span> actually in
          </span>
          {officeStats.expected > 0 && (
            <span className="text-indigo-800">
              <span className="font-semibold">
                {Math.round((officeStats.actual / officeStats.expected) * 100)}%
              </span>{" "}
              of expected
            </span>
          )}
          {officeStats.noShow > 0 && (
            <span
              className="rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-700"
              title="Planned to be in the office but the scanner never saw them"
            >
              {officeStats.noShow} didn&apos;t come in
            </span>
          )}
          {officeStats.unplanned > 0 && (
            <span
              className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-800"
              title="Came into the office on a day they were not planned to"
            >
              {officeStats.unplanned} came in unplanned
            </span>
          )}
          <span className="text-xs text-indigo-700">
            Leave, holidays and rest days are excluded from both figures.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Preferred Name</span>
                  <SortButton label="Preferred Name" active={sortDir("name")} onClick={() => toggleSort("name")} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Job Title</th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Subdepartment</span>
                  <HeaderFilter label="Subdepartment" options={subdeptOptions} selected={subdeptFilter} onChange={setSubdeptFilter} />
                </th>
                {employeePicker !== "dropdown" && (
                  <th className="px-4 py-3 font-medium text-gray-600">Manager</th>
                )}
                <th className="px-4 py-3 font-medium text-gray-600">DeskTime URL</th>
                {!isSingleDate && (
                  <th className="px-4 py-3 font-medium text-gray-600">
                    <span className="align-middle">Date</span>
                    <SortButton label="Date" active={sortDir("date")} onClick={() => toggleSort("date")} />
                  </th>
                )}
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Country</span>
                  <HeaderFilter label="Country" options={countryOptions} selected={countryFilter} onChange={setCountryFilter} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Working Location</span>
                  <HeaderFilter label="Working Location" options={locationOptions} selected={locationFilter} onChange={setLocationFilter} />
                </th>
                <th
                  className="px-4 py-3 font-medium text-gray-600"
                  title="Actual location based on biometric punches (Office) or DeskTime activity (Online)"
                >
                  <span className="align-middle">Actual Location</span>
                  <HeaderFilter
                    label="Actual Location"
                    options={[
                      { value: "office", label: "Office" },
                      { value: "online", label: "Online" },
                      { value: "none", label: "No data" },
                    ]}
                    selected={actualLocationFilter}
                    onChange={setActualLocationFilter}
                  />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Schedule</th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">TZ</span>
                  <HeaderFilter label="TZ" options={tzOptions} selected={tzFilter} onChange={setTzFilter} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Clock In</span>
                  <SortButton label="Clock In" active={sortDir("clock_in")} onClick={() => toggleSort("clock_in")} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Clock Out</span>
                  <SortButton label="Clock Out" active={sortDir("clock_out")} onClick={() => toggleSort("clock_out")} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Status</span>
                  <HeaderFilter label="Status" options={statusOptions} selected={statusFilter} onChange={setStatusFilter} align="right" />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Late</span>
                  <SortButton label="Late" active={sortDir("late")} onClick={() => toggleSort("late")} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  <span className="align-middle">Early Out</span>
                  <SortButton label="Early Out" active={sortDir("early")} onClick={() => toggleSort("early")} />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">DeskTime</th>
                <th className="px-4 py-3 font-medium text-gray-600">Productive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.map((r) => {
                const { user, date } = r;
                // Clock in/out, lateness and status come from DeskTime only.
                // Biometric punches feed the Actual Location column, never
                // these — see biometricPresence below.
                const log = r.log;
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
                        name={user.preferred_name || user.first_name || user.full_name.split(/\s+/)[0] || user.email.split("@")[0]}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {user.job_title || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {user.subdepartment || <span className="text-gray-400">-</span>}
                    </td>
                    {employeePicker !== "dropdown" && (
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {user.manager ? (
                          <UserNameLink
                            userId={user.manager.id}
                            name={displayName(user.manager)}
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    )}
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
                    <td className="px-4 py-3">
                      {(() => {
                        const actualLoc = getActualLocation(user.id, date, ds, log);
                        if (actualLoc === "office") {
                          const mismatch = location && location !== "office";
                          return (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 ${
                                mismatch ? "ring-1 ring-red-500" : ""
                              }`}
                              title={mismatch ? "Different from planned location" : undefined}
                            >
                              {mismatch && (
                                <Flag size={12} className="fill-red-500 text-red-500" />
                              )}
                              Office
                            </span>
                          );
                        }
                        if (actualLoc === "online") {
                          const mismatch = location === "office";
                          return (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-teal-50 text-teal-700 ${
                                mismatch ? "ring-1 ring-red-500" : ""
                              }`}
                              title={mismatch ? "Planned to be in office" : undefined}
                            >
                              {mismatch && (
                                <Flag size={12} className="fill-red-500 text-red-500" />
                              )}
                              Online
                            </span>
                          );
                        }
                        return <span className="text-gray-400">-</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(() => {
                        const schedStart = log?.scheduled_start ?? schedTimes?.start ?? null;
                        const schedEnd = log?.scheduled_end ?? schedTimes?.end ?? null;
                        if (!schedStart || !schedEnd) return "-";
                        return (
                          <div className="space-y-0.5">
                            <div>
                              {schedStart.slice(0, 5)} - {schedEnd.slice(0, 5)}
                            </div>
                            {hasNightDifferentialHours(schedStart, schedEnd) && (
                              <NightDiffNote size="xs" />
                            )}
                          </div>
                        );
                      })()}
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
