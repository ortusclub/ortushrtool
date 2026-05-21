"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";
import { FlagAcknowledge } from "./flag-acknowledge";
import { EmployeeFlagNote } from "./employee-flag-note";
import { FlagsExport, type FlagRow } from "./flags-export";
import { UserNameLink } from "@/components/shared/user-name-link";
import { displayName } from "@/lib/utils";

interface Employee {
  id: string;
  full_name: string;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
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
  employee?: {
    full_name: string;
    preferred_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
    manager_id: string | null;
  } | null;
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
  const router = useRouter();
  const [flags, setFlags] = useState(initialFlags);
  const [loading, setLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"" | "pending" | "acknowledged">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtered, setFiltered] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkNote, setBulkNote] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  // True when the user has expanded selection beyond the visible page to all
  // pending flags matching current filters (Gmail-style "Select all").
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);

  const resetMatchingSelection = () => {
    setSelectAllMatching(false);
    setMatchingCount(null);
  };

  const employeeIds = employees.map((e) => e.id);

  // Client-side filter by employee name search (matches preferred + first/last/full + email)
  const displayedFlags = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return flags;
    return flags.filter((f) => {
      const e = f.employee;
      if (!e) return false;
      const haystack = [
        e.full_name,
        e.preferred_name,
        e.first_name,
        e.last_name,
        e.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [flags, employeeSearch]);

  // A flag is selectable iff the viewer can acknowledge it AND it's pending.
  const canAcknowledgeFlag = (flag: AttendanceFlag) => {
    if (flag.acknowledged) return false;
    if (flag.employee_id === currentUserId) return false;
    if (viewerIsAdmin) return true;
    return (
      !!flag.employee?.manager_id &&
      flag.employee.manager_id === currentUserId
    );
  };

  const selectableFlags = displayedFlags.filter(canAcknowledgeFlag);
  const allSelectableSelected =
    selectableFlags.length > 0 &&
    selectableFlags.every((f) => selectedIds.has(f.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const f of selectableFlags) next.delete(f.id);
      } else {
        for (const f of selectableFlags) next.add(f.id);
      }
      return next;
    });
  };

  const fetchFlagsForExport = async (): Promise<FlagRow[]> => {
    const supabase = createClient();
    let query = supabase
      .from("attendance_flags")
      .select(
        "*, employee:users!attendance_flags_employee_id_fkey(full_name, preferred_name, first_name, last_name, email, manager_id)"
      )
      .in("employee_id", employeeIds)
      .order("flag_date", { ascending: false });

    if (selectedType) query = query.eq("flag_type", selectedType);
    if (selectedStatus === "acknowledged") query = query.eq("acknowledged", true);
    else if (selectedStatus === "pending") query = query.eq("acknowledged", false);
    if (startDate && endDate) {
      query = query.gte("flag_date", startDate).lte("flag_date", endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Apply the same client-side employee search the table uses
    const all = (data ?? []) as FlagRow[];
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f) => {
      const e = f.employee;
      if (!e) return false;
      const haystack = [
        e.full_name,
        e.preferred_name,
        e.first_name,
        e.last_name,
        e.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  };

  // Query every pending flag matching the current filters that the viewer can
  // acknowledge. Mirrors the visible-flags filter chain plus the client-side
  // employee search.
  const fetchAllMatchingPendingIds = async (): Promise<string[]> => {
    const supabase = createClient();
    let query = supabase
      .from("attendance_flags")
      .select(
        "id, employee:users!attendance_flags_employee_id_fkey(full_name, preferred_name, first_name, last_name, email)"
      )
      .in("employee_id", employeeIds)
      .eq("acknowledged", false)
      .neq("employee_id", currentUserId);

    if (selectedType) query = query.eq("flag_type", selectedType);
    if (startDate && endDate) {
      query = query.gte("flag_date", startDate).lte("flag_date", endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const q = employeeSearch.trim().toLowerCase();
    const rows = (data ?? []) as {
      id: string;
      employee:
        | {
            full_name: string;
            preferred_name: string | null;
            first_name: string | null;
            last_name: string | null;
            email: string;
          }
        | { full_name: string; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string }[]
        | null;
    }[];
    const filtered = !q
      ? rows
      : rows.filter((f) => {
          const e = Array.isArray(f.employee) ? f.employee[0] : f.employee;
          if (!e) return false;
          const haystack = [
            e.full_name,
            e.preferred_name,
            e.first_name,
            e.last_name,
            e.email,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
    return filtered.map((f) => f.id);
  };

  const handleSelectAllMatching = async () => {
    setSelectingAllMatching(true);
    setBulkMessage(null);
    try {
      const ids = await fetchAllMatchingPendingIds();
      setSelectedIds(new Set(ids));
      setMatchingCount(ids.length);
      setSelectAllMatching(true);
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : "Failed to load matching flags");
    } finally {
      setSelectingAllMatching(false);
    }
  };

  const handleBulkAcknowledge = async () => {
    setBulkLoading(true);
    setBulkMessage(null);
    const res = await fetch("/api/flags/bulk-acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flag_ids: Array.from(selectedIds),
        notes: bulkNote,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBulkMessage(data.error ?? "Bulk acknowledge failed");
      setBulkLoading(false);
      return;
    }
    const skipped = (data.skipped ?? []).length;
    setBulkMessage(
      `Acknowledged ${data.acknowledged}.${skipped > 0 ? ` Skipped ${skipped}.` : ""}`
    );
    setSelectedIds(new Set());
    resetMatchingSelection();
    setBulkNote("");
    setBulkLoading(false);
    router.refresh();
  };

  const handleFilter = async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("attendance_flags")
      .select("*, employee:users!attendance_flags_employee_id_fkey(full_name, preferred_name, first_name, last_name, email, manager_id)")
      .order("flag_date", { ascending: false });

    query = query.in("employee_id", employeeIds);

    if (selectedType) {
      query = query.eq("flag_type", selectedType);
    }

    if (selectedStatus === "acknowledged") {
      query = query.eq("acknowledged", true);
    } else if (selectedStatus === "pending") {
      query = query.eq("acknowledged", false);
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
    setSelectedIds(new Set());
    resetMatchingSelection();
  };

  const handleReset = async () => {
    setLoading(true);
    setEmployeeSearch("");
    setSelectedType("");
    setSelectedStatus("");
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
    setSelectedIds(new Set());
    resetMatchingSelection();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="block text-xs font-medium text-gray-600">Employee</label>
          <div className="relative mt-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={employeeSearch}
              onChange={(e) => {
                setEmployeeSearch(e.target.value);
                if (selectAllMatching) {
                  setSelectedIds(new Set());
                  resetMatchingSelection();
                }
              }}
              placeholder="Search by name or email..."
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
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
          <label className="block text-xs font-medium text-gray-600">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) =>
              setSelectedStatus(e.target.value as "" | "pending" | "acknowledged")
            }
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="acknowledged">Acknowledged</option>
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
          {employeeSearch.trim()
            ? `Showing ${displayedFlags.length} of ${flags.length} flag(s) matching "${employeeSearch.trim()}"`
            : filtered
              ? `Showing ${flags.length} flag(s)`
              : "Showing last 50 flags"}
        </span>
        <div className="ml-auto">
          <FlagsExport fetchFlags={fetchFlagsForExport} />
        </div>
      </div>

      {/* Bulk acknowledge bar (only HR / managers will see selectable rows) */}
      {selectableFlags.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allSelectableSelected || selectAllMatching}
              onChange={() => {
                if (selectAllMatching) {
                  setSelectedIds(new Set());
                  resetMatchingSelection();
                } else {
                  toggleAll();
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Select all pending on this page ({selectableFlags.length})
          </label>
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-gray-600">
                {selectedIds.size} selected
              </span>
              <input
                type="text"
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="Optional manager note (applied to all)..."
                className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleBulkAcknowledge}
                disabled={bulkLoading}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkLoading
                  ? "Acknowledging..."
                  : `Acknowledge ${selectedIds.size}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  setBulkNote("");
                  resetMatchingSelection();
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            </>
          )}
          {bulkMessage && (
            <span className="text-xs text-gray-500">{bulkMessage}</span>
          )}

          {/* Gmail-style "Select all matching" prompt */}
          {allSelectableSelected && !selectAllMatching && (
            <div className="w-full rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
              All {selectableFlags.length} pending flag
              {selectableFlags.length === 1 ? "" : "s"} on this page
              {selectableFlags.length === 1 ? " is" : " are"} selected.
              <button
                type="button"
                onClick={handleSelectAllMatching}
                disabled={selectingAllMatching}
                className="ml-2 font-medium underline hover:text-blue-700 disabled:opacity-60"
              >
                {selectingAllMatching
                  ? "Loading…"
                  : "Select all pending flags matching current filters"}
              </button>
            </div>
          )}
          {selectAllMatching && matchingCount !== null && (
            <div className="w-full rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
              All {matchingCount} pending flag
              {matchingCount === 1 ? "" : "s"} matching current filters
              {matchingCount === 1 ? " is" : " are"} selected.
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  resetMatchingSelection();
                }}
                className="ml-2 font-medium underline hover:text-blue-700"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}

      {/* Flags list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {displayedFlags.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {displayedFlags.map((flag) => {
              const isOwn = flag.employee_id === currentUserId;
              const isDirectManager =
                !!flag.employee?.manager_id &&
                flag.employee.manager_id === currentUserId;
              const canAcknowledgeThis =
                !isOwn && (viewerIsAdmin || isDirectManager);
              const isSelectable = canAcknowledgeFlag(flag);
              return (
                <div
                  key={flag.id}
                  className="flex items-start justify-between gap-6 p-6"
                >
                  {isSelectable && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(flag.id)}
                      onChange={() => toggleOne(flag.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label="Select flag for bulk acknowledge"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    {flag.employee && (
                      <p className="font-medium text-gray-900">
                        <UserNameLink
                          userId={flag.employee_id}
                          name={displayName(flag.employee)}
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
