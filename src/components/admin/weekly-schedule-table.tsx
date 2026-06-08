"use client";

import { useState, useMemo } from "react";
import { format, startOfWeek, addDays, eachDayOfInterval, isSameDay, parseISO, isWeekend } from "date-fns";
import { Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { displayName, formatTime, cn, hasNightDifferentialHours } from "@/lib/utils";
import { UserNameLink } from "@/components/shared/user-name-link";
import { HeaderFilter } from "@/components/shared/header-filter";
import { SortButton } from "@/components/shared/sort-button";
import { NightDiffNote } from "@/components/shared/night-diff-note";
import { HOLIDAY_COUNTRY_LABELS } from "@/types/database";
import type {
  User,
  Schedule,
  Holiday,
  LeaveRequest,
  ScheduleAdjustment,
  HolidayWorkRequest,
  HolidayCountry,
} from "@/types/database";

interface Props {
  users: User[];
  schedules: Schedule[];
  holidays: Holiday[];
}

export function WeeklyScheduleTable({ users, schedules, holidays }: Props) {
  // Default to current week (Mon-Fri)
  const defaultStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const defaultEnd = addDays(defaultStart, 4);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [search, setSearch] = useState("");
  const [leaveMap, setLeaveMap] = useState<Record<string, LeaveRequest[]>>({});
  const [adjustmentMap, setAdjustmentMap] = useState<Record<string, ScheduleAdjustment[]>>({});
  const [holidayWorkMap, setHolidayWorkMap] = useState<Record<string, HolidayWorkRequest[]>>({});
  const [loaded, setLoaded] = useState(false);

  // Column filters. Empty set = no filter for that column.
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set());
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set());
  // Per-day status filter keyed by yyyy-MM-dd. Values: "office" | "online" |
  // "leave" | "holiday" | "rest".
  const [dayFilters, setDayFilters] = useState<Record<string, Set<string>>>({});
  // null = default order (full_name asc, as fetched). Click cycles asc -> desc -> null.
  const [sort, setSort] = useState<{
    column: "name" | "team" | "country";
    dir: "asc" | "desc";
  } | null>(null);

  const toggleSort = (column: "name" | "team" | "country") => {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, dir: "asc" };
      if (prev.dir === "asc") return { column, dir: "desc" };
      return null;
    });
  };

  // Generate weekday-only dates for the selected range
  const weekDates = useMemo(() => {
    if (startDate > endDate) return [];
    return eachDayOfInterval({ start: startDate, end: endDate }).filter(
      (d) => !isWeekend(d)
    );
  }, [startDate, endDate]);

  // Load leave requests and adjustments for the date range
  const loadWeekData = async () => {
    if (weekDates.length === 0) return;
    const supabase = createClient();
    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");

    const [{ data: leaves }, { data: adjustments }, { data: holidayWork }] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "approved")
        .lte("start_date", endStr)
        .gte("end_date", startStr),
      supabase
        .from("schedule_adjustments")
        .select("*")
        .eq("status", "approved")
        .gte("requested_date", startStr)
        .lte("requested_date", endStr)
        // Oldest first so the most recent approved adjustment wins per date.
        .order("created_at", { ascending: true }),
      supabase
        .from("holiday_work_requests")
        .select("*")
        .eq("status", "approved")
        .gte("holiday_date", startStr)
        .lte("holiday_date", endStr),
    ]);

    const lMap: Record<string, LeaveRequest[]> = {};
    for (const l of leaves ?? []) {
      if (!lMap[l.employee_id]) lMap[l.employee_id] = [];
      lMap[l.employee_id].push(l);
    }

    const aMap: Record<string, ScheduleAdjustment[]> = {};
    for (const a of adjustments ?? []) {
      if (!aMap[a.employee_id]) aMap[a.employee_id] = [];
      aMap[a.employee_id].push(a);
    }

    const hwMap: Record<string, HolidayWorkRequest[]> = {};
    for (const hw of holidayWork ?? []) {
      if (!hwMap[hw.employee_id]) hwMap[hw.employee_id] = [];
      hwMap[hw.employee_id].push(hw);
    }

    setLeaveMap(lMap);
    setAdjustmentMap(aMap);
    setHolidayWorkMap(hwMap);
    setLoaded(true);
  };

  // Load data on mount and date range change
  useMemo(() => {
    setLoaded(false);
    loadWeekData();
  }, [startDate, endDate]);

  // Unique values for the Team and Country filter dropdowns.
  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.department) set.add(u.department);
    return [...set].sort();
  }, [users]);

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.holiday_country) set.add(u.holiday_country);
    return [...set].sort();
  }, [users]);

  // Build schedule lookup: userId -> dayOfWeek -> Schedule.
  // Declared before filteredUsers because the day-filter path calls
  // getCellContent (which reads these), and useMemo factories run during
  // render — referencing them later would hit the temporal dead zone.
  const scheduleMap = useMemo(() => {
    const map = new Map<string, Map<number, Schedule>>();
    for (const s of schedules) {
      if (!map.has(s.employee_id)) map.set(s.employee_id, new Map());
      const userMap = map.get(s.employee_id)!;
      // Keep the most recent effective schedule per day
      const existing = userMap.get(s.day_of_week);
      if (!existing || s.effective_from > existing.effective_from) {
        userMap.set(s.day_of_week, s);
      }
    }
    return map;
  }, [schedules]);

  // Holiday lookup: date string -> holidays by country
  const holidayMap = useMemo(() => {
    const map = new Map<string, Map<string, Holiday>>();
    for (const h of holidays) {
      // For recurring holidays, check if date matches month/day
      const hDate = parseISO(h.date);
      for (const wd of weekDates) {
        const matches = h.is_recurring
          ? hDate.getMonth() === wd.getMonth() && hDate.getDate() === wd.getDate()
          : isSameDay(hDate, wd);
        if (matches) {
          const key = format(wd, "yyyy-MM-dd");
          if (!map.has(key)) map.set(key, new Map());
          map.get(key)!.set(`${h.country}-${h.name}`, h);
        }
      }
    }
    return map;
  }, [holidays, weekDates]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = users.filter((u) => {
      if (search) {
        const matchText =
          displayName(u).toLowerCase().includes(q) ||
          (u.full_name?.toLowerCase().includes(q) ?? false) ||
          u.email.toLowerCase().includes(q) ||
          (u.department ?? "").toLowerCase().includes(q);
        if (!matchText) return false;
      }
      if (teamFilter.size > 0 && !teamFilter.has(u.department ?? "")) return false;
      if (countryFilter.size > 0 && !countryFilter.has(u.holiday_country ?? "")) return false;
      // Per-day status filters: row must match every active day filter.
      for (const [dateStr, allowed] of Object.entries(dayFilters)) {
        if (allowed.size === 0) continue;
        const date = parseISO(dateStr);
        const dayOfWeek = (date.getDay() + 6) % 7;
        const cell = getCellContent(u, date, dayOfWeek);
        const bucket = bucketCell(cell);
        if (!allowed.has(bucket)) return false;
      }
      return true;
    });

    if (sort) {
      const key = (u: User) => {
        if (sort.column === "name") return displayName(u).toLowerCase();
        if (sort.column === "team") return (u.department ?? "").toLowerCase();
        return (
          HOLIDAY_COUNTRY_LABELS[u.holiday_country] ?? u.holiday_country ?? ""
        ).toLowerCase();
      };
      filtered.sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (ka < kb) return sort.dir === "asc" ? -1 : 1;
        if (ka > kb) return sort.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
    // getCellContent depends on the maps + schedules above; eslint will flag
    // the missing dep, but those are stable for the life of this render and
    // including the function reference would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, teamFilter, countryFilter, dayFilters, sort, leaveMap, adjustmentMap, holidayWorkMap, schedules, holidays]);

  function getCellContent(user: User, date: Date, dayOfWeek: number) {
    const dateStr = format(date, "yyyy-MM-dd");

    // Check for holiday in user's country
    const dayHolidays = holidayMap.get(dateStr);
    if (dayHolidays) {
      for (const h of dayHolidays.values()) {
        if (h.country === user.holiday_country) {
          // Check if user has approved holiday work for this date
          const userHW = holidayWorkMap[user.id] ?? [];
          const hw = userHW.find((r) => r.holiday_date === dateStr);
          if (hw) {
            return {
              type: "holiday_work" as const,
              label: `${formatTime(hw.start_time)} - ${formatTime(hw.end_time)}`,
              location: hw.work_location,
              holidayName: h.name,
              startTime: hw.start_time,
              endTime: hw.end_time,
            };
          }
          return { type: "holiday" as const, label: h.name };
        }
      }
    }

    // Check for approved leave
    const userLeaves = leaveMap[user.id] ?? [];
    for (const l of userLeaves) {
      if (dateStr >= l.start_date && dateStr <= l.end_date) {
        return { type: "leave" as const, label: l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1) + " Leave" };
      }
    }

    // Check for schedule adjustment
    const userAdjs = adjustmentMap[user.id] ?? [];
    const adj = userAdjs.find((a) => a.requested_date === dateStr);

    // Get base schedule
    const userSchedules = scheduleMap.get(user.id);
    const schedule = userSchedules?.get(dayOfWeek);

    if (schedule?.is_rest_day && !adj) {
      return { type: "rest" as const, label: "Rest Day" };
    }

    if (adj) {
      return {
        type: "adjusted" as const,
        label: `${formatTime(adj.requested_start_time)} - ${formatTime(adj.requested_end_time)}`,
        location: adj.requested_work_location ?? (schedule?.work_location || null),
        startTime: adj.requested_start_time,
        endTime: adj.requested_end_time,
      };
    }

    if (schedule) {
      return {
        type: "schedule" as const,
        label: `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
        location: schedule.work_location,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
      };
    }

    return { type: "none" as const, label: "—" };
  }

  const isToday = (date: Date) => isSameDay(date, new Date());

  // Collapse a cell into one of the filter buckets shown in the per-day
  // dropdown. Returns "" for the "none" type (no schedule data) so those
  // rows can never match an active filter.
  function bucketCell(cell: ReturnType<typeof getCellContent>): string {
    switch (cell.type) {
      case "schedule":
      case "adjusted":
      case "holiday_work":
        return "location" in cell && cell.location === "online" ? "online" : "office";
      case "leave":
        return "leave";
      case "holiday":
        return "holiday";
      case "rest":
        return "rest";
      default:
        return "";
    }
  }

  /** Count office days in the current Mon–Fri of the week containing `refDate`. */
  function getOfficeDaysInWeek(user: User, refDate: Date): number {
    const mon = startOfWeek(refDate, { weekStartsOn: 1 });
    let count = 0;
    for (let i = 0; i < 5; i++) {
      const d = addDays(mon, i);
      const cell = getCellContent(user, d, i);
      if (
        (cell.type === "schedule" || cell.type === "adjusted" || cell.type === "holiday_work") &&
        "location" in cell &&
        cell.location === "office"
      ) {
        count++;
      }
    }
    return count;
  }

  const legend = (
    <div className="flex flex-wrap gap-4 text-xs text-gray-600">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-blue-100" /> Office
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-green-100" /> Online
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-cyan-100" /> Adjusted
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-amber-100" /> Leave
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-purple-100" /> Holiday
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-teal-100" /> Working on Holiday
      </div>
      <div className="flex items-center gap-1.5">
        <Flag size={12} className="fill-red-500 text-red-500" /> Less than 2 office days
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">From</label>
          <input
            type="date"
            value={format(startDate, "yyyy-MM-dd")}
            onChange={(e) => {
              if (!e.target.value) return;
              setStartDate(parseISO(e.target.value));
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="text-sm text-gray-600">To</label>
          <input
            type="date"
            value={format(endDate, "yyyy-MM-dd")}
            min={format(startDate, "yyyy-MM-dd")}
            onChange={(e) => {
              if (!e.target.value) return;
              setEndDate(parseISO(e.target.value));
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {(format(startDate, "yyyy-MM-dd") !== format(defaultStart, "yyyy-MM-dd") ||
            format(endDate, "yyyy-MM-dd") !== format(defaultEnd, "yyyy-MM-dd")) && (
            <button
              onClick={() => {
                setStartDate(defaultStart);
                setEndDate(defaultEnd);
              }}
              className="ml-1 rounded-lg px-3 py-2 text-sm text-blue-600 transition-all hover:bg-blue-50 active:scale-95"
            >
              This Week
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder="Search by name, email, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Legend */}
      {legend}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700">
                <span className="align-middle">Name</span>
                <SortButton
                  label="Name"
                  active={sort?.column === "name" ? sort.dir : null}
                  onClick={() => toggleSort("name")}
                />
              </th>
              <th className="px-3 py-3 text-left font-semibold text-gray-700">
                <span className="align-middle">Team</span>
                <SortButton
                  label="Team"
                  active={sort?.column === "team" ? sort.dir : null}
                  onClick={() => toggleSort("team")}
                />
                <HeaderFilter
                  label="Team"
                  options={teamOptions.map((t) => ({ value: t, label: t }))}
                  selected={teamFilter}
                  onChange={setTeamFilter}
                />
              </th>
              <th className="px-3 py-3 text-left font-semibold text-gray-700">
                <span className="align-middle">Country</span>
                <SortButton
                  label="Country"
                  active={sort?.column === "country" ? sort.dir : null}
                  onClick={() => toggleSort("country")}
                />
                <HeaderFilter
                  label="Country"
                  options={countryOptions.map((c) => ({
                    value: c,
                    label: HOLIDAY_COUNTRY_LABELS[c as HolidayCountry] ?? c,
                  }))}
                  selected={countryFilter}
                  onChange={setCountryFilter}
                />
              </th>
              {weekDates.map((date, i) => {
                const dateStr = format(date, "yyyy-MM-dd");
                const daySel = dayFilters[dateStr] ?? new Set<string>();
                return (
                  <th
                    key={i}
                    className={cn(
                      "px-3 py-3 text-center font-semibold text-gray-700 min-w-[130px]",
                      isToday(date) && "bg-blue-50"
                    )}
                  >
                    <div className="flex items-center justify-center">
                      <span>{format(date, "EEE")}</span>
                      <HeaderFilter
                        label={format(date, "EEE")}
                        options={DAY_FILTER_OPTIONS}
                        selected={daySel}
                        onChange={(next) =>
                          setDayFilters((prev) => {
                            const copy = { ...prev };
                            if (next.size === 0) delete copy[dateStr];
                            else copy[dateStr] = next;
                            return copy;
                          })
                        }
                        align="center"
                      />
                    </div>
                    <div className="text-xs font-normal text-gray-500">
                      {format(date, "MMM d")}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="sticky left-0 z-10 bg-white px-4 py-3">
                  <div className="flex items-center gap-1.5 font-medium text-gray-900">
                    <UserNameLink userId={user.id} name={displayName(user)} />
                    {getOfficeDaysInWeek(user, new Date()) < 2 && (
                      <span title={`Only ${getOfficeDaysInWeek(user, new Date())} office day(s) this week`}>
                        <Flag size={14} className="fill-red-500 text-red-500" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </td>
                <td className="px-3 py-3 text-gray-600">{user.department || "—"}</td>
                <td className="px-3 py-3">
                  <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {HOLIDAY_COUNTRY_LABELS[user.holiday_country] ?? user.holiday_country}
                  </span>
                </td>
                {weekDates.map((date, i) => {
                  // day_of_week: 0=Mon, 1=Tue, ... 4=Fri (matches schedule table)
                  const dayOfWeek = (date.getDay() + 6) % 7;
                  const cell = getCellContent(user, date, dayOfWeek);
                  return (
                    <td
                      key={i}
                      className={cn(
                        "px-3 py-3 text-center",
                        isToday(date) && "bg-blue-50/50",
                      )}
                    >
                      {cell.type === "holiday_work" && (
                        <div>
                          <div className="text-xs text-gray-700">{cell.label}</div>
                          {"location" in cell && cell.location && (
                            <span className={cn(
                              "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                              cell.location === "online"
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            )}>
                              {cell.location === "online" ? "Online" : "Office"}
                            </span>
                          )}
                          {hasNightDifferentialHours(cell.startTime, cell.endTime) && (
                            <div className="mt-0.5">
                              <NightDiffNote size="xs" />
                            </div>
                          )}
                          <div className="mt-0.5 text-[10px] text-teal-600">Working on {"holidayName" in cell ? cell.holidayName : "Holiday"}</div>
                        </div>
                      )}
                      {cell.type === "holiday" && (
                        <span className="inline-block rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700">
                          {cell.label}
                        </span>
                      )}
                      {cell.type === "leave" && (
                        <span className="inline-block rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                          {cell.label}
                        </span>
                      )}
                      {cell.type === "rest" && (
                        <span className="text-xs text-gray-400">Rest Day</span>
                      )}
                      {cell.type === "adjusted" && (
                        <div>
                          <span className="inline-block rounded bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-700">
                            {cell.label}
                          </span>
                          {"location" in cell && cell.location && (
                            <span className={cn(
                              "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                              cell.location === "online"
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            )}>
                              {cell.location === "online" ? "Online" : "Office"}
                            </span>
                          )}
                          {hasNightDifferentialHours(cell.startTime, cell.endTime) && (
                            <div className="mt-0.5">
                              <NightDiffNote size="xs" />
                            </div>
                          )}
                          <div className="mt-0.5 text-[10px] text-cyan-500">Adjusted</div>
                        </div>
                      )}
                      {cell.type === "schedule" && (
                        <div>
                          <div className="text-xs text-gray-700">{cell.label}</div>
                          {"location" in cell && cell.location && (
                            <span className={cn(
                              "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                              cell.location === "online"
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            )}>
                              {cell.location === "online" ? "Online" : "Office"}
                            </span>
                          )}
                          {hasNightDifferentialHours(cell.startTime, cell.endTime) && (
                            <div className="mt-0.5">
                              <NightDiffNote size="xs" />
                            </div>
                          )}
                        </div>
                      )}
                      {cell.type === "none" && (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={3 + weekDates.length} className="px-4 py-8 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {legend}
    </div>
  );
}

const DAY_FILTER_OPTIONS = [
  { value: "office", label: "Office" },
  { value: "online", label: "Online" },
  { value: "leave", label: "Leave" },
  { value: "holiday", label: "Holiday" },
  { value: "rest", label: "Rest Day" },
];
