"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  timezone: string;
}

interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  scheduled_start: string;
  scheduled_end: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  late_minutes: number | null;
  early_departure_minutes: number | null;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
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

const statusStyles: Record<string, string> = {
  on_time: "bg-green-100 text-green-700",
  late_arrival: "bg-yellow-100 text-yellow-700",
  early_departure: "bg-orange-100 text-orange-700",
  late_and_early: "bg-red-100 text-red-700",
  absent: "bg-red-100 text-red-700",
  rest_day: "bg-gray-100 text-gray-500",
};

const statusLabels: Record<string, string> = {
  on_time: "OK",
  late_arrival: "Late",
  early_departure: "Early",
  late_and_early: "L&E",
  absent: "Absent",
  rest_day: "Rest",
};

export function AllAttendanceTable({ users }: { users: UserRow[] }) {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    // Default to start of current week (Monday)
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + 4; // Friday
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  });
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Build date list
  const dates = useMemo(() => {
    const result: string[] = [];
    const current = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    while (current <= end) {
      result.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
    return result;
  }, [startDate, endDate]);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("attendance_logs")
      .select("*")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date");
    setLogs(data ?? []);
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Build lookup: employeeId -> date -> log
  const logMap = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceLog>>();
    for (const log of logs) {
      if (!map.has(log.employee_id)) map.set(log.employee_id, new Map());
      map.get(log.employee_id)!.set(log.date, log);
    }
    return map;
  }, [logs]);

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
            From
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="text-sm text-gray-500">
          {filteredUsers.length} employees &middot; {dates.length} day(s)
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              {/* Date header row */}
              <tr className="border-b border-gray-200 bg-gray-50">
                <th
                  className="sticky left-0 z-10 bg-gray-50 px-3 py-2"
                  rowSpan={2}
                >
                  <span className="text-sm font-medium text-gray-600">
                    Employee
                  </span>
                </th>
                {dates.map((date) => (
                  <th
                    key={date}
                    colSpan={6}
                    className="border-l border-gray-200 px-1 py-2 text-center font-semibold text-gray-800"
                  >
                    {formatShortDate(date)}
                  </th>
                ))}
              </tr>
              {/* Sub-header row */}
              <tr className="border-b border-gray-300 bg-gray-50">
                {dates.map((date) => (
                  <SubHeaders key={date} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => {
                const userLogs = logMap.get(user.id);
                const tz = user.timezone || "Asia/Manila";

                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 min-w-[150px]">
                      <div>
                        <span className="font-medium text-gray-900 text-sm">
                          {user.full_name || user.email.split("@")[0]}
                        </span>
                        <span className="ml-1 text-gray-400">
                          {getTzLabel(tz)}
                        </span>
                      </div>
                    </td>
                    {dates.map((date) => {
                      const log = userLogs?.get(date);
                      return (
                        <DayCells
                          key={date}
                          log={log ?? null}
                          tz={tz}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SubHeaders() {
  return (
    <>
      <th className="border-l border-gray-200 px-1 py-1 font-medium text-gray-500 min-w-[70px]">
        Sched
      </th>
      <th className="px-1 py-1 font-medium text-gray-500 min-w-[50px]">In</th>
      <th className="px-1 py-1 font-medium text-gray-500 min-w-[50px]">Out</th>
      <th className="px-1 py-1 font-medium text-gray-500 min-w-[45px]">
        Status
      </th>
      <th className="px-1 py-1 font-medium text-gray-500 min-w-[35px]">
        Late
      </th>
      <th className="px-1 py-1 font-medium text-gray-500 min-w-[35px]">
        Early
      </th>
    </>
  );
}

function DayCells({
  log,
  tz,
}: {
  log: AttendanceLog | null;
  tz: string;
}) {
  if (!log) {
    return (
      <>
        <td className="border-l border-gray-100 px-1 py-2 text-center text-gray-300">
          -
        </td>
        <td className="px-1 py-2 text-center text-gray-300">-</td>
        <td className="px-1 py-2 text-center text-gray-300">-</td>
        <td className="px-1 py-2 text-center text-gray-300">-</td>
        <td className="px-1 py-2 text-center text-gray-300">-</td>
        <td className="px-1 py-2 text-center text-gray-300">-</td>
      </>
    );
  }

  return (
    <>
      <td className="border-l border-gray-100 px-1 py-2 text-center text-gray-600">
        {log.scheduled_start?.slice(0, 5)}-{log.scheduled_end?.slice(0, 5)}
      </td>
      <td className="px-1 py-2 text-center">
        {formatClockTime(log.clock_in, tz)}
      </td>
      <td className="px-1 py-2 text-center">
        {formatClockTime(log.clock_out, tz)}
      </td>
      <td className="px-1 py-2 text-center">
        <span
          className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${statusStyles[log.status] ?? "bg-gray-100"}`}
        >
          {statusLabels[log.status] ?? log.status}
        </span>
      </td>
      <td className="px-1 py-2 text-center text-yellow-600">
        {log.late_minutes ? `${log.late_minutes}` : "-"}
      </td>
      <td className="px-1 py-2 text-center text-orange-600">
        {log.early_departure_minutes ? `${log.early_departure_minutes}` : "-"}
      </td>
    </>
  );
}
