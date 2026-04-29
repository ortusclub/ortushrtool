"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";
import { FlagAcknowledge } from "./flag-acknowledge";
import { EmployeeFlagNote } from "./employee-flag-note";
import { UserNameLink } from "@/components/shared/user-name-link";

interface Employee {
  id: string;
  full_name: string;
  email: string;
}

interface AttendanceFlag {
  id: string;
  employee_id: string;
  flag_type: string;
  flag_date: string;
  deviation_minutes: number;
  scheduled_time: string;
  actual_time: string | null;
  acknowledged: boolean;
  notes: string | null;
  employee_notes: string | null;
  employee?: { full_name: string; email: string; manager_id: string | null } | null;
}

interface Props {
  initialFlags: AttendanceFlag[];
  employees: Employee[];
  currentUserId: string;
  /** True when the viewer is hr_admin or super_admin (acknowledges anyone). */
  viewerIsAdmin: boolean;
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

function formatTime(time: string): string {
  if (!time) return "-";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

const flagTypeLabels: Record<string, string> = {
  late_arrival: "Late Arrival",
  early_departure: "Early Departure",
  absent: "Absent",
};

const flagTypeStyles: Record<string, string> = {
  late_arrival: "bg-yellow-100 text-yellow-700",
  early_departure: "bg-orange-100 text-orange-700",
  absent: "bg-red-100 text-red-700",
};

export function FlagsTable({ initialFlags, employees, currentUserId, viewerIsAdmin }: Props) {
  const [flags, setFlags] = useState(initialFlags);
  const [loading, setLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtered, setFiltered] = useState(false);

  const employeeIds = employees.map((e) => e.id);

  const handleFilter = async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("attendance_flags")
      .select("*, employee:users!attendance_flags_employee_id_fkey(full_name, email, manager_id)")
      .order("flag_date", { ascending: false });

    if (selectedEmployee) {
      query = query.eq("employee_id", selectedEmployee);
    } else {
      query = query.in("employee_id", employeeIds);
    }

    if (selectedType) {
      query = query.eq("flag_type", selectedType);
    }

    if (startDate && endDate) {
      query = query.gte("flag_date", startDate).lte("flag_date", endDate);
    } else {
      query = query.limit(50);
    }

    const { data } = await query;
    setFlags(data ?? []);
    setFiltered(true);
    setLoading(false);
  };

  const handleReset = async () => {
    setLoading(true);
    setSelectedEmployee("");
    setSelectedType("");
    setStartDate("");
    setEndDate("");

    const supabase = createClient();
    const { data } = await supabase
      .from("attendance_flags")
      .select("*, employee:users!attendance_flags_employee_id_fkey(full_name, email, manager_id)")
      .in("employee_id", employeeIds)
      .order("flag_date", { ascending: false })
      .limit(50);

    setFlags(data ?? []);
    setFiltered(false);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600">Employee</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Flag Type</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All types</option>
            <option value="late_arrival">Late Arrival</option>
            <option value="early_departure">Early Departure</option>
            <option value="absent">Absent</option>
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
            ? `Showing ${flags.length} flag(s)`
            : "Showing last 50 flags"}
        </span>
      </div>

      {/* Flags list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {flags.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {flags.map((flag) => {
              const isOwn = flag.employee_id === currentUserId;
              const isDirectManager =
                !!flag.employee?.manager_id &&
                flag.employee.manager_id === currentUserId;
              const canAcknowledgeThis =
                !isOwn && (viewerIsAdmin || isDirectManager);
              return (
                <div
                  key={flag.id}
                  className="flex items-start justify-between gap-6 p-6"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    {flag.employee && (
                      <p className="font-medium text-gray-900">
                        <UserNameLink
                          userId={flag.employee_id}
                          name={flag.employee.full_name || flag.employee.email}
                        />
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${flagTypeStyles[flag.flag_type] ?? "bg-gray-100"}`}
                      >
                        {flagTypeLabels[flag.flag_type] ?? flag.flag_type}
                      </span>
                      <span className="text-sm text-gray-600">
                        {formatDate(flag.flag_date)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Scheduled:</span>{" "}
                      {formatTime(flag.scheduled_time)}
                      {flag.actual_time && (
                        <>
                          {" "}
                          &rarr; <span className="font-medium">Actual:</span>{" "}
                          {formatTime(flag.actual_time)}
                        </>
                      )}
                    </p>
                    {flag.deviation_minutes > 0 && (
                      <p className="text-sm text-gray-500">
                        {flag.deviation_minutes} minutes deviation
                      </p>
                    )}

                    {/* Employee note: editable when own + not acknowledged; read-only otherwise */}
                    {isOwn ? (
                      <EmployeeFlagNote
                        flagId={flag.id}
                        initialNote={flag.employee_notes}
                        acknowledged={flag.acknowledged}
                      />
                    ) : flag.employee_notes ? (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-700">Employee note:</span>{" "}
                        <span className="italic">{flag.employee_notes}</span>
                      </p>
                    ) : null}

                    {/* Manager note (set on acknowledge) — read-only display */}
                    {flag.notes && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-700">Manager note:</span>{" "}
                        <span className="italic">{flag.notes}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {flag.acknowledged ? (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        Acknowledged
                      </span>
                    ) : canAcknowledgeThis ? (
                      <FlagAcknowledge flagId={flag.id} />
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                        {isOwn ? "Awaiting manager" : "Pending"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No flags found{filtered ? " for this filter" : ""}.
          </div>
        )}
      </div>
    </div>
  );
}
