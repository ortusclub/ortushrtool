"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

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
  raw_response: Record<string, unknown> | null;
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

const statusStyles: Record<string, string> = {
  on_time: "bg-green-100 text-green-700",
  late_arrival: "bg-yellow-100 text-yellow-700",
  early_departure: "bg-orange-100 text-orange-700",
  late_and_early: "bg-red-100 text-red-700",
  absent: "bg-red-100 text-red-700",
  rest_day: "bg-gray-100 text-gray-500",
};

const statusLabels: Record<string, string> = {
  on_time: "On Time",
  late_arrival: "Late",
  early_departure: "Early Out",
  late_and_early: "Late & Early",
  absent: "Absent",
  rest_day: "Rest Day",
};

export function AllAttendanceTable({ users }: { users: UserRow[] }) {
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("attendance_logs")
      .select("*")
      .eq("date", selectedDate);
    setLogs(data ?? []);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Build lookup: employeeId -> log
  const logMap = useMemo(() => {
    const map = new Map<string, AttendanceLog>();
    for (const log of logs) {
      map.set(log.employee_id, log);
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

  const goDay = (offset: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

  // Stats
  const stats = useMemo(() => {
    let onTime = 0, late = 0, early = 0, absent = 0, noData = 0;
    for (const user of filteredUsers) {
      const log = logMap.get(user.id);
      if (!log) { noData++; continue; }
      if (log.status === "on_time") onTime++;
      else if (log.status === "late_arrival") late++;
      else if (log.status === "early_departure") early++;
      else if (log.status === "late_and_early") { late++; early++; }
      else if (log.status === "absent") absent++;
    }
    return { onTime, late, early, absent, noData };
  }, [filteredUsers, logMap]);

  return (
    <div className="space-y-4">
      {/* Date navigation & search */}
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goDay(-1)}
            className="relative z-10 rounded-lg border border-gray-300 p-2.5 hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm [&::-webkit-calendar-picker-indicator]:opacity-50"
          />
          <button
            type="button"
            onClick={() => goDay(1)}
            className="relative z-10 rounded-lg border border-gray-300 p-2.5 hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Date display & stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {formatDisplayDate(selectedDate)}
        </h2>
        <div className="flex gap-3 text-sm">
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-700 font-medium">
            {stats.onTime} On Time
          </span>
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-700 font-medium">
            {stats.late} Late
          </span>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700 font-medium">
            {stats.early} Early Out
          </span>
          <span className="rounded-full bg-red-100 px-3 py-1 text-red-700 font-medium">
            {stats.absent} Absent
          </span>
          {stats.noData > 0 && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-500 font-medium">
              {stats.noData} No Data
            </span>
          )}
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
                <th className="px-4 py-3 font-medium text-gray-600">Employee</th>
                <th className="px-4 py-3 font-medium text-gray-600">TZ</th>
                <th className="px-4 py-3 font-medium text-gray-600">Scheduled</th>
                <th className="px-4 py-3 font-medium text-gray-600">Clock In</th>
                <th className="px-4 py-3 font-medium text-gray-600">Clock Out</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Late</th>
                <th className="px-4 py-3 font-medium text-gray-600">Early Out</th>
                <th className="px-4 py-3 font-medium text-gray-600">DeskTime</th>
                <th className="px-4 py-3 font-medium text-gray-600">Productive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => {
                const log = logMap.get(user.id);
                const tz = user.timezone || "Asia/Manila";
                const raw = log?.raw_response as Record<string, unknown> | null;
                const desktimeSeconds = raw?.desktimeTime as number | undefined;
                const productiveSeconds = raw?.productiveTime as number | undefined;

                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {user.full_name || user.email.split("@")[0]}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {getTzLabel(tz)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log
                        ? `${log.scheduled_start?.slice(0, 5)} - ${log.scheduled_end?.slice(0, 5)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {log ? formatClockTime(log.clock_in, tz) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {log ? formatClockTime(log.clock_out, tz) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {log ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusStyles[log.status] ?? "bg-gray-100"}`}
                        >
                          {statusLabels[log.status] ?? log.status}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-yellow-600">
                      {log?.late_minutes ? `${log.late_minutes}m` : "-"}
                    </td>
                    <td className="px-4 py-3 text-orange-600">
                      {log?.early_departure_minutes
                        ? `${log.early_departure_minutes}m`
                        : "-"}
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
    </div>
  );
}
