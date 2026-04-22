"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download } from "lucide-react";
import { parseISO } from "date-fns";

function countWeekdays(start: string, end: string): number {
  let count = 0;
  const s = parseISO(start);
  const e = parseISO(end);
  const current = new Date(s);
  while (current <= e) {
    const dow = current.getDay();
    if (dow >= 1 && dow <= 5) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

interface UserOption {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
}

interface LeaveRow {
  id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  manager_name: string;
  leave_type: string;
  leave_duration: string;
  days: number;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  reviewer_name: string;
  reviewer_notes: string;
  reviewed_at: string;
  created_at: string;
}

const LEAVE_LABELS: Record<string, string> = {
  anniversary: "Anniversary Leave",
  annual: "Annual Leave",
  birthday: "Birthday Leave",
  cto: "CTO Leave",
  trinity: "Trinity Leave",
  maternity_paternity: "Maternity/Paternity Leave",
  solo_parent: "Solo Parent Leave",
  bereavement: "Bereavement Leave",
};

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
};

export function LeaveReport({ users }: { users: UserOption[] }) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("leave_requests")
      .select(
        "*, employee:users!leave_requests_employee_id_fkey(full_name, email, department, manager_id), reviewer:users!leave_requests_reviewed_by_fkey(full_name)"
      )
      .lte("start_date", endDate)
      .gte("end_date", startDate)
      .order("start_date", { ascending: false });

    if (selectedUser) query = query.eq("employee_id", selectedUser);
    if (selectedType) query = query.eq("leave_type", selectedType);
    if (selectedStatus) query = query.eq("status", selectedStatus);

    const { data } = await query;

    // Build manager name lookup
    const userMap = new Map(users.map((u) => [u.id, u.full_name || u.email]));

    const mapped: LeaveRow[] = (data ?? []).map((r: Record<string, unknown>) => {
      const emp = r.employee as { full_name: string; email: string; department: string | null; manager_id: string | null } | null;
      const rev = r.reviewer as { full_name: string } | null;
      const managerName = emp?.manager_id ? (userMap.get(emp.manager_id) ?? "") : "";
      const isHalf = r.leave_duration === "half_day";
      const duration = isHalf
        ? `Half Day (${(r.half_day_period as string)?.toUpperCase() || ""})`
        : "Full Day";
      const days = isHalf ? 0.5 : countWeekdays(r.start_date as string, r.end_date as string);

      return {
        id: r.id as string,
        employee_name: emp?.full_name || "",
        employee_email: emp?.email || "",
        department: emp?.department || "",
        manager_name: managerName,
        leave_type: LEAVE_LABELS[r.leave_type as string] ?? (r.leave_type as string),
        leave_duration: duration,
        days,
        start_date: r.start_date as string,
        end_date: r.end_date as string,
        reason: r.reason as string,
        status: r.status as string,
        reviewer_name: rev?.full_name || "",
        reviewer_notes: (r.reviewer_notes as string) || "",
        reviewed_at: (r.reviewed_at as string) || "",
        created_at: r.created_at as string,
      };
    });

    setRows(mapped);
    setLoading(false);
  }, [startDate, endDate, selectedUser, selectedType, selectedStatus]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = () => {
    const headers = [
      "Employee",
      "Email",
      "Department",
      "Manager",
      "Leave Type",
      "Duration",
      "Total Days",
      "Start Date",
      "End Date",
      "Reason",
      "Approval Status",
      "Pending Approval By",
      "Approved/Rejected By",
      "Date Approved/Rejected",
      "Reviewer Notes",
      "Date Submitted",
    ];
    const csvRows = [headers.join(",")];

    rows.forEach((r) => {
      const pendingApprovalBy = r.status === "pending" ? r.manager_name : "";
      csvRows.push(
        [
          `"${r.employee_name}"`,
          r.employee_email,
          `"${r.department}"`,
          `"${r.manager_name}"`,
          `"${r.leave_type}"`,
          `"${r.leave_duration}"`,
          r.days,
          r.start_date,
          r.end_date,
          `"${r.reason.replace(/"/g, '""')}"`,
          r.status,
          `"${pendingApprovalBy}"`,
          `"${r.reviewer_name}"`,
          r.reviewed_at ? new Date(r.reviewed_at).toISOString().split("T")[0] : "",
          `"${r.reviewer_notes.replace(/"/g, '""')}"`,
          new Date(r.created_at).toISOString().split("T")[0],
        ].join(",")
      );
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Leave Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            {Object.entries(LEAVE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
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

      {/* Summary */}
      <p className="text-sm text-gray-500">
        {rows.length} leave record{rows.length !== 1 ? "s" : ""} found
      </p>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600">Employee</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Type</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Duration</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Total Days</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Dates</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Reason</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Approval Status</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Pending Approval By</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Approved By</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Date Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{r.employee_name}</p>
                        <p className="text-xs text-gray-500">{r.employee_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{r.leave_type}</td>
                    <td className="px-6 py-4 text-gray-700">{r.leave_duration}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{r.days}</td>
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                      {r.start_date === r.end_date
                        ? r.start_date
                        : `${r.start_date} to ${r.end_date}`}
                    </td>
                    <td className="px-6 py-4 text-gray-700 max-w-[200px] truncate" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {r.status === "pending" ? r.manager_name || "—" : "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-700">{r.reviewer_name || "—"}</td>
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                      {r.reviewed_at ? new Date(r.reviewed_at).toISOString().split("T")[0] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No leave records for the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}
