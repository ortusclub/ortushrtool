"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download } from "lucide-react";

interface UserOption {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
}

interface SummaryRow {
  employee_id: string;
  full_name: string;
  email: string;
  total_days: number;
  on_time: number;
  late: number;
  early: number;
  absent: number;
  compliance_pct: number;
}

export function ReportsDashboard({ users }: { users: UserOption[] }) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [selectedUser, setSelectedUser] = useState("");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("attendance_logs")
      .select("*, employee:users!attendance_logs_employee_id_fkey(full_name, email)")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (selectedUser) {
      query = query.eq("employee_id", selectedUser);
    }

    const { data: logs } = await query;

    // Aggregate by employee
    const byEmployee = new Map<string, SummaryRow>();

    (logs ?? []).forEach((log) => {
      const key = log.employee_id;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employee_id: key,
          full_name: log.employee?.full_name || "",
          email: log.employee?.email || "",
          total_days: 0,
          on_time: 0,
          late: 0,
          early: 0,
          absent: 0,
          compliance_pct: 0,
        });
      }

      const row = byEmployee.get(key)!;
      row.total_days++;
      if (log.status === "on_time") row.on_time++;
      if (log.status === "late_arrival" || log.status === "late_and_early") row.late++;
      if (log.status === "early_departure" || log.status === "late_and_early") row.early++;
      if (log.status === "absent") row.absent++;
    });

    const rows = Array.from(byEmployee.values()).map((row) => ({
      ...row,
      compliance_pct:
        row.total_days > 0
          ? Math.round((row.on_time / row.total_days) * 100)
          : 0,
    }));

    rows.sort((a, b) => a.compliance_pct - b.compliance_pct);
    setSummary(rows);
    setLoading(false);
  }, [startDate, endDate, selectedUser]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = () => {
    const headers = [
      "Employee",
      "Email",
      "Days Worked",
      "On Time",
      "Late",
      "Early Out",
      "Absent",
      "Compliance %",
    ];
    const csvRows = [headers.join(",")];

    summary.forEach((row) => {
      csvRows.push(
        [
          `"${row.full_name}"`,
          row.email,
          row.total_days,
          row.on_time,
          row.late,
          row.early,
          row.absent,
          row.compliance_pct,
        ].join(",")
      );
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-report-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary totals
  const totals = summary.reduce(
    (acc, row) => ({
      late: acc.late + row.late,
      early: acc.early + row.early,
      absent: acc.absent + row.absent,
      onTime: acc.onTime + row.on_time,
    }),
    { late: 0, early: 0, absent: 0, onTime: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Employee
          </label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Employees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="On Time" value={totals.onTime} color="text-green-600" />
        <SummaryCard label="Late Arrivals" value={totals.late} color="text-yellow-600" />
        <SummaryCard label="Early Departures" value={totals.early} color="text-orange-600" />
        <SummaryCard label="Absences" value={totals.absent} color="text-red-600" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : summary.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600">Employee</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Days</th>
                  <th className="px-6 py-3 font-medium text-gray-600">On Time</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Late</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Early Out</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Absent</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.map((row) => (
                  <tr key={row.employee_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          {row.full_name || row.email}
                        </p>
                        <p className="text-xs text-gray-500">{row.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">{row.total_days}</td>
                    <td className="px-6 py-4 text-green-600">{row.on_time}</td>
                    <td className="px-6 py-4 text-yellow-600">{row.late}</td>
                    <td className="px-6 py-4 text-orange-600">{row.early}</td>
                    <td className="px-6 py-4 text-red-600">{row.absent}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-green-500"
                            style={{ width: `${row.compliance_pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">
                          {row.compliance_pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No data for the selected period.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
