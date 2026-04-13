"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";

interface AttendanceLog {
  id: string;
  date: string;
  scheduled_start: string;
  scheduled_end: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  late_minutes: number | null;
  early_departure_minutes: number | null;
}

interface Props {
  initialLogs: AttendanceLog[];
  userId: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatClockTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export function AttendanceTable({ initialLogs, userId }: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtered, setFiltered] = useState(false);

  const handleFilter = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("attendance_logs")
      .select("*")
      .eq("employee_id", userId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    setLogs(data ?? []);
    setFiltered(true);
    setLoading(false);
  };

  const handleReset = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("attendance_logs")
      .select("*")
      .eq("employee_id", userId)
      .order("date", { ascending: false })
      .limit(30);

    setLogs(data ?? []);
    setStartDate("");
    setEndDate("");
    setFiltered(false);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleFilter}
          disabled={loading || !startDate || !endDate}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Search size={16} />
          {loading ? "Loading..." : "Filter"}
        </button>
        {filtered && (
          <button
            onClick={handleReset}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Reset
          </button>
        )}
        <span className="text-xs text-gray-500">
          {filtered
            ? `Showing ${logs.length} record(s)`
            : `Showing last 30 days`}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Scheduled</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Clock In</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Clock Out</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Late (min)</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Early Out (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      {log.scheduled_start} - {log.scheduled_end}
                    </td>
                    <td className="px-6 py-4">{formatClockTime(log.clock_in)}</td>
                    <td className="px-6 py-4">{formatClockTime(log.clock_out)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-6 py-4">{log.late_minutes ?? "-"}</td>
                    <td className="px-6 py-4">{log.early_departure_minutes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No attendance records found{filtered ? " for this date range" : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    on_time: "bg-green-100 text-green-700",
    late_arrival: "bg-yellow-100 text-yellow-700",
    early_departure: "bg-orange-100 text-orange-700",
    late_and_early: "bg-red-100 text-red-700",
    absent: "bg-red-100 text-red-700",
    rest_day: "bg-gray-100 text-gray-600",
    on_leave: "bg-blue-100 text-blue-700",
    holiday: "bg-purple-100 text-purple-700",
    working: "bg-green-50 text-green-600",
  };

  const labels: Record<string, string> = {
    on_time: "On Time",
    late_arrival: "Late",
    early_departure: "Early Out",
    late_and_early: "Late & Early",
    absent: "Absent",
    rest_day: "Rest Day",
    on_leave: "On Leave",
    holiday: "Holiday",
    working: "Working",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status] ?? "bg-gray-100"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
