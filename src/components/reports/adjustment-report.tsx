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

interface AdjustmentRow {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  requested_date: string;
  original_location: string;
  new_location: string;
  original_time: string;
  new_time: string;
  reason: string;
  status: string;
}

interface SummaryRow {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  officeToOnline: number;
  onlineToOffice: number;
  timeChanges: number;
  total: number;
}

export function AdjustmentReport({ users }: { users: UserOption[] }) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [selectedUser, setSelectedUser] = useState("");
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("schedule_adjustments")
      .select(
        "*, employee:users!schedule_adjustments_employee_id_fkey(full_name, email, department)"
      )
      .eq("status", "approved")
      .gte("requested_date", startDate)
      .lte("requested_date", endDate)
      .order("requested_date", { ascending: false });

    if (selectedUser) query = query.eq("employee_id", selectedUser);

    const { data } = await query;

    // Fetch base schedules to determine original location
    const employeeIds = [...new Set((data ?? []).map((d) => d.employee_id))];
    let schedules: { employee_id: string; day_of_week: number; work_location: string }[] = [];

    if (employeeIds.length > 0) {
      const { data: scheds } = await supabase
        .from("schedules")
        .select("employee_id, day_of_week, work_location")
        .in("employee_id", employeeIds);
      schedules = scheds ?? [];
    }

    // Build schedule map: employee_id:day_of_week -> location
    const schedMap = new Map<string, string>();
    for (const s of schedules) {
      schedMap.set(`${s.employee_id}:${s.day_of_week}`, s.work_location);
    }

    const mapped: AdjustmentRow[] = (data ?? []).map((r) => {
      const emp = r.employee as { full_name: string; email: string; department: string | null } | null;
      const dateObj = new Date(r.requested_date + "T00:00:00");
      const dayOfWeek = (dateObj.getDay() + 6) % 7;
      const origLocation = schedMap.get(`${r.employee_id}:${dayOfWeek}`) ?? "office";
      const newLocation = r.requested_work_location ?? origLocation;

      return {
        employee_id: r.employee_id,
        employee_name: emp?.full_name || "",
        employee_email: emp?.email || "",
        department: emp?.department || "",
        requested_date: r.requested_date,
        original_location: origLocation,
        new_location: newLocation,
        original_time: `${r.original_start_time?.slice(0, 5)} - ${r.original_end_time?.slice(0, 5)}`,
        new_time: `${r.requested_start_time?.slice(0, 5)} - ${r.requested_end_time?.slice(0, 5)}`,
        reason: r.reason || "",
        status: r.status,
      };
    });

    setRows(mapped);
    setLoading(false);
  }, [startDate, endDate, selectedUser]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Build summary per employee
  const summary: SummaryRow[] = (() => {
    const map = new Map<string, SummaryRow>();
    for (const r of rows) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, {
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          employee_email: r.employee_email,
          department: r.department,
          officeToOnline: 0,
          onlineToOffice: 0,
          timeChanges: 0,
          total: 0,
        });
      }
      const s = map.get(r.employee_id)!;
      s.total++;
      if (r.original_location !== r.new_location) {
        if (r.original_location === "office" && r.new_location === "online") {
          s.officeToOnline++;
        } else if (r.original_location === "online" && r.new_location === "office") {
          s.onlineToOffice++;
        }
      }
      if (r.original_time !== r.new_time) {
        s.timeChanges++;
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  })();

  const handleExport = () => {
    if (view === "summary") {
      const headers = [
        "Employee", "Email", "Department",
        "Office to Online", "Online to Office", "Time Changes", "Total Adjustments",
      ];
      const csvRows = [headers.join(",")];
      for (const s of summary) {
        csvRows.push([
          `"${s.employee_name}"`, s.employee_email, `"${s.department}"`,
          s.officeToOnline, s.onlineToOffice, s.timeChanges, s.total,
        ].join(","));
      }
      downloadCsv(csvRows.join("\n"), `schedule-changes-summary-${startDate}-to-${endDate}.csv`);
    } else {
      const headers = [
        "Employee", "Email", "Department", "Date",
        "Original Location", "New Location", "Original Time", "New Time", "Reason",
      ];
      const csvRows = [headers.join(",")];
      for (const r of rows) {
        csvRows.push([
          `"${r.employee_name}"`, r.employee_email, `"${r.department}"`, r.requested_date,
          r.original_location, r.new_location, r.original_time, r.new_time,
          `"${r.reason.replace(/"/g, '""')}"`,
        ].join(","));
      }
      downloadCsv(csvRows.join("\n"), `schedule-changes-detail-${startDate}-to-${endDate}.csv`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Employee</label>
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Employees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">View</label>
          <select value={view} onChange={(e) => setView(e.target.value as "summary" | "detail")} className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="summary">Summary</option>
            <option value="detail">Detailed</option>
          </select>
        </div>
        <button
          onClick={handleExport}
          disabled={rows.length === 0}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <p className="text-sm text-gray-500">
        {rows.length} adjustment{rows.length !== 1 ? "s" : ""} found
      </p>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : view === "summary" ? (
          summary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-6 py-3 font-medium text-gray-600">Employee</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Office → Online</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Online → Office</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Time Changes</th>
                    <th className="px-6 py-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.map((s) => (
                    <tr key={s.employee_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{s.employee_name}</p>
                          <p className="text-xs text-gray-500">{s.employee_email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {s.officeToOnline > 0 ? (
                          <span className="rounded bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">{s.officeToOnline}</span>
                        ) : <span className="text-gray-400">0</span>}
                      </td>
                      <td className="px-6 py-4">
                        {s.onlineToOffice > 0 ? (
                          <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{s.onlineToOffice}</span>
                        ) : <span className="text-gray-400">0</span>}
                      </td>
                      <td className="px-6 py-4">
                        {s.timeChanges > 0 ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{s.timeChanges}</span>
                        ) : <span className="text-gray-400">0</span>}
                      </td>
                      <td className="px-6 py-4 font-medium">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">No schedule adjustments for the selected period.</div>
          )
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600">Employee</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Original Location</th>
                  <th className="px-6 py-3 font-medium text-gray-600">New Location</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Original Time</th>
                  <th className="px-6 py-3 font-medium text-gray-600">New Time</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{r.employee_name}</p>
                        <p className="text-xs text-gray-500">{r.employee_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap">{r.requested_date}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        r.original_location === "office" ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"
                      }`}>
                        {r.original_location === "office" ? "Office" : "Online"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        r.new_location === "office" ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"
                      }`}>
                        {r.new_location === "office" ? "Office" : "Online"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap">{r.original_time}</td>
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap">{r.new_time}</td>
                    <td className="px-6 py-4 text-gray-700 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">No schedule adjustments for the selected period.</div>
        )}
      </div>
    </div>
  );
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
