"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { Search } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  timezone: string;
  manager_id: string | null;
}

interface ScheduleRow {
  id: string;
  employee_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
  work_location: string;
}

interface Adjustment {
  id: string;
  employee_id: string;
  requested_date: string;
  requested_start_time: string;
  requested_end_time: string;
  status: string;
  reason: string;
}

interface LeaveRow {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

export function SchedulesTable({
  users,
  schedules,
  managerMap,
}: {
  users: UserRow[];
  schedules: ScheduleRow[];
  managerMap: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);

  // Fetch adjustments and leave for the selected date
  useEffect(() => {
    async function fetchForDate() {
      const supabase = createClient();

      const { data: adj } = await supabase
        .from("schedule_adjustments")
        .select("*")
        .eq("requested_date", selectedDate)
        .eq("status", "approved");

      setAdjustments(adj ?? []);

      const { data: lv } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "approved")
        .lte("start_date", selectedDate)
        .gte("end_date", selectedDate);

      setLeaves(lv ?? []);
    }

    fetchForDate();
  }, [selectedDate]);

  // Build schedule lookup
  const scheduleMap = useMemo(() => {
    const map = new Map<string, Map<number, ScheduleRow>>();
    for (const s of schedules) {
      if (!map.has(s.employee_id)) map.set(s.employee_id, new Map());
      map.get(s.employee_id)!.set(s.day_of_week, s);
    }
    return map;
  }, [schedules]);

  // Build adjustment lookup for selected date
  const adjustmentMap = useMemo(() => {
    const map = new Map<string, Adjustment>();
    for (const a of adjustments) {
      map.set(a.employee_id, a);
    }
    return map;
  }, [adjustments]);

  // Build leave lookup for selected date
  const leaveMap = useMemo(() => {
    const map = new Map<string, LeaveRow>();
    for (const l of leaves) {
      map.set(l.employee_id, l);
    }
    return map;
  }, [leaves]);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  // Get selected date's day of week
  const selectedDayOfWeek = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    return (d.getDay() + 6) % 7; // Monday=0
  }, [selectedDate]);

  const dayHeaders = DAYS_OF_WEEK.slice(0, 5);

  const leaveLabels: Record<string, string> = {
    annual: "Annual",
    sick: "Sick",
    personal: "Personal",
    unpaid: "Unpaid",
    other: "Other",
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex-1 min-w-[200px]">
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
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Date (shows adjustments & leave)
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="text-sm text-gray-500">
          {filteredUsers.length} of {users.length} employees
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="sticky left-0 bg-gray-50 px-4 py-3 font-medium text-gray-600 min-w-[160px]">
                Person
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 min-w-[120px]">
                Manager
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 min-w-[60px]">
                TZ
              </th>
              {dayHeaders.map((day, idx) => (
                <th
                  key={day}
                  className={`px-4 py-3 font-medium text-center min-w-[150px] ${
                    idx === selectedDayOfWeek
                      ? "bg-blue-100 text-blue-800"
                      : "text-gray-600"
                  }`}
                >
                  {day}
                </th>
              ))}
              <th className="px-4 py-3 font-medium text-gray-600 min-w-[160px]">
                Adjustment / Leave
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredUsers.map((user) => {
              const userSchedule = scheduleMap.get(user.id);
              const adjustment = adjustmentMap.get(user.id);
              const leave = leaveMap.get(user.id);
              const tz =
                user.timezone === "Asia/Manila"
                  ? "PHT"
                  : user.timezone === "Europe/Berlin"
                    ? "CET"
                    : user.timezone === "Asia/Dubai"
                      ? "GST"
                      : user.timezone;

              return (
                <tr key={user.id} className="hover:bg-blue-50">
                  <td className="sticky left-0 bg-white px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/admin/schedules/${user.id}`}
                      className="block"
                    >
                      <span className="text-blue-600 hover:underline">
                        {user.full_name || user.email.split("@")[0]}
                      </span>
                      <p className="text-xs text-gray-400 font-normal">
                        {user.email}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {user.manager_id
                      ? managerMap[user.manager_id] ?? "-"
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{tz}</td>
                  {[0, 1, 2, 3, 4].map((dayIdx) => {
                    const sched = userSchedule?.get(dayIdx);
                    const isSelectedDay = dayIdx === selectedDayOfWeek;

                    // Show adjustment override if on selected day
                    if (isSelectedDay && adjustment) {
                      return (
                        <td
                          key={dayIdx}
                          className="px-4 py-3 text-center bg-blue-50"
                        >
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                            Adjusted
                          </span>
                          <p className="mt-0.5 text-xs text-amber-700 font-medium">
                            {adjustment.requested_start_time.slice(0, 5)} -{" "}
                            {adjustment.requested_end_time.slice(0, 5)}
                          </p>
                        </td>
                      );
                    }

                    // Show leave if on selected day
                    if (isSelectedDay && leave) {
                      return (
                        <td
                          key={dayIdx}
                          className="px-4 py-3 text-center bg-purple-50"
                        >
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700">
                            {leaveLabels[leave.leave_type] ?? "Leave"}
                          </span>
                        </td>
                      );
                    }

                    if (!sched || sched.is_rest_day) {
                      return (
                        <td
                          key={dayIdx}
                          className={`px-4 py-3 text-center text-gray-400 text-xs ${isSelectedDay ? "bg-blue-50" : ""}`}
                        >
                          Rest
                        </td>
                      );
                    }

                    const isOffice = sched.work_location === "office";
                    return (
                      <td
                        key={dayIdx}
                        className={`px-4 py-3 text-center ${isSelectedDay ? "bg-blue-50" : ""}`}
                      >
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            isOffice
                              ? "bg-blue-50 text-blue-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {isOffice ? "Office" : "Online"}
                        </span>
                        <p className="mt-0.5 text-xs text-gray-600">
                          {sched.start_time.slice(0, 5)} -{" "}
                          {sched.end_time.slice(0, 5)}
                        </p>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    {adjustment && (
                      <div className="space-y-0.5">
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Adjusted
                        </span>
                        <p className="text-xs text-gray-600">
                          {adjustment.requested_start_time.slice(0, 5)} -{" "}
                          {adjustment.requested_end_time.slice(0, 5)}
                        </p>
                      </div>
                    )}
                    {leave && (
                      <div className="space-y-0.5">
                        <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          {leaveLabels[leave.leave_type] ?? "Leave"}
                        </span>
                        <p className="text-xs text-gray-500">
                          {leave.start_date} → {leave.end_date}
                        </p>
                      </div>
                    )}
                    {!adjustment && !leave && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
