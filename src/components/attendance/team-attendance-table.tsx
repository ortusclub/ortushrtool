"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
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
  employee?: { full_name: string; email: string } | null;
}

interface Props {
  initialLogs: AttendanceLog[];
  teamMembers: TeamMember[];
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

export function TeamAttendanceTable({ initialLogs, teamMembers }: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtered, setFiltered] = useState(false);

  const memberIds = teamMembers.map((m) => m.id);

  const handleFilter = async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("attendance_logs")
      .select("*, employee:users!attendance_logs_employee_id_fkey(full_name, email)")
      .order("date", { ascending: false });

    if (selectedMember) {
      query = query.eq("employee_id", selectedMember);
    } else {
      query = query.in("employee_id", memberIds);
    }

    if (startDate && endDate) {
      query = query.gte("date", startDate).lte("date", endDate);
    } else {
      query = query.limit(50);
    }

    const { data } = await query;
    setLogs(data ?? []);
    setFiltered(true);
    setLoading(false);
  };

  const handleReset = async () => {
    setLoading(true);
    setSelectedMember("");
    setStartDate("");
    setEndDate("");

    const supabase = createClient();
    const { data } = await supabase
      .from("attendance_logs")
      .select("*, employee:users!attendance_logs_employee_id_fkey(full_name, email)")
      .in("employee_id", memberIds)
      .order("date", { ascending: false })
      .limit(50);

    setLogs(data ?? []);
    setFiltered(false);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600">Team Member</label>
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All members</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
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
          disabled={loading}
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
            : "Showing last 50 records"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600">Employee</th>
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
                    <td className="px-6 py-4 font-medium">
                      {log.employee?.full_name || log.employee?.email || "-"}
                    </td>
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
            No attendance records found{filtered ? " for this filter" : " for your team"}.
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
