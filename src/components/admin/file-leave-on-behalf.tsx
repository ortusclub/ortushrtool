"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Save, X } from "lucide-react";
import { UNIVERSAL_LEAVE_TYPES, LEAVE_TYPE_LABELS } from "@/lib/constants";

interface Employee {
  id: string;
  full_name: string | null;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

function displayName(e: Employee) {
  if (e.preferred_name) return e.preferred_name;
  const parts = [e.first_name, e.last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return e.full_name ?? e.email;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function FileLeaveOnBehalf({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [leaveType, setLeaveType] = useState("");
  const [leaveDuration, setLeaveDuration] = useState<"full_day" | "half_day">("full_day");
  const [halfDayPeriod, setHalfDayPeriod] = useState<"am" | "pm">("am");
  const [halfDayStart, setHalfDayStart] = useState("");
  const [halfDayEnd, setHalfDayEnd] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);

  const isHalfDay = leaveDuration === "half_day";

  // Load the employee's requestable leave types: universal + per-type
  // activations + anything granted via an assigned plan (leave_plan_allocations).
  // The plan part is what surfaces plan-granted types like Bereavement.
  async function loadTypes(id: string) {
    if (!id) {
      setAvailableTypes([]);
      setLeaveType("");
      return;
    }
    setLoadingTypes(true);
    const supabase = createClient();
    const [{ data: activatedRows }, { data: planRows }] = await Promise.all([
      supabase.from("employee_leave_types").select("leave_type").eq("employee_id", id),
      supabase.from("employee_leave_plans").select("plan_id").eq("employee_id", id),
    ]);
    const activated = (activatedRows ?? []).map((d) => d.leave_type);
    const planIds = (planRows ?? []).map((p) => p.plan_id);
    let planTypes: string[] = [];
    if (planIds.length > 0) {
      const { data: allocRows } = await supabase
        .from("leave_plan_allocations")
        .select("leave_type")
        .in("plan_id", planIds);
      planTypes = (allocRows ?? []).map((a) => a.leave_type);
    }
    const types = Array.from(
      new Set([...UNIVERSAL_LEAVE_TYPES, ...activated, ...planTypes])
    );
    setAvailableTypes(types);
    setLeaveType(types[0] ?? "");
    setLoadingTypes(false);
  }

  const submit = async () => {
    if (!employeeId) { setError("Select an employee."); return; }
    if (!leaveType) { setError("Select a leave type."); return; }
    if (!startDate) { setError("Pick a start date."); return; }
    if (isHalfDay && (!halfDayStart || !halfDayEnd)) {
      setError("Set the half-day start and end times.");
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch("/api/leave-requests/for-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: employeeId,
        leave_type: leaveType,
        leave_duration: leaveDuration,
        half_day_period: isHalfDay ? halfDayPeriod : undefined,
        half_day_start_time: isHalfDay ? halfDayStart : undefined,
        half_day_end_time: isHalfDay ? halfDayEnd : undefined,
        start_date: startDate,
        end_date: isHalfDay ? startDate : endDate || startDate,
        reason,
        auto_approve: autoApprove,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Submit failed.");
      return;
    }
    setOpen(false);
    setEmployeeId("");
    setAvailableTypes([]);
    setLeaveType("");
    setStartDate("");
    setEndDate("");
    setHalfDayStart("");
    setHalfDayEnd("");
    setReason("");
    setAutoApprove(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-6 text-left hover:bg-gray-50"
      >
        <div>
          <h3 className="font-semibold text-gray-900">File Leave on Behalf</h3>
          <p className="text-sm text-gray-600">
            Submit a leave request for another employee — it goes through their manager&apos;s normal approval.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          <Plus size={16} /> New
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">File Leave on Behalf</h3>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Employee picker */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Employee</label>
        <select
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value);
            loadTypes(e.target.value);
          }}
          className={inputClass}
        >
          <option value="">Select employee…</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{displayName(e)}</option>
          ))}
        </select>
      </div>

      {employeeId && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Leave type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Leave type</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              disabled={loadingTypes}
              className={inputClass}
            >
              {loadingTypes ? (
                <option value="">Loading…</option>
              ) : (
                availableTypes.map((t) => (
                  <option key={t} value={t}>{LEAVE_TYPE_LABELS[t] ?? t}</option>
                ))
              )}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Duration</label>
            <select
              value={leaveDuration}
              onChange={(e) => setLeaveDuration(e.target.value as "full_day" | "half_day")}
              className={inputClass}
            >
              <option value="full_day">Full day</option>
              <option value="half_day">Half day</option>
            </select>
          </div>

          {/* Start date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {isHalfDay ? "Date" : "Start date"}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* End date (full day only) */}
          {!isHalfDay && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">End date</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {/* Half-day fields */}
          {isHalfDay && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">AM / PM</label>
                <select
                  value={halfDayPeriod}
                  onChange={(e) => setHalfDayPeriod(e.target.value as "am" | "pm")}
                  className={inputClass}
                >
                  <option value="am">Morning</option>
                  <option value="pm">Afternoon</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Start time</label>
                <input type="time" value={halfDayStart} onChange={(e) => setHalfDayStart(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">End time</label>
                <input type="time" value={halfDayEnd} onChange={(e) => setHalfDayEnd(e.target.value)} className={inputClass} />
              </div>
            </>
          )}

          {/* Reason */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </div>

          {/* Auto-approve */}
          <label className="flex cursor-pointer items-start gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="mt-0.5 h-4 w-4 text-blue-600"
            />
            <span className="text-xs text-gray-700">
              <span className="font-medium">Auto-approve</span> — file it as already approved, skipping the manager&apos;s approval step.
            </span>
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy || !employeeId}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />{busy ? "Submitting…" : autoApprove ? "Add & Approve" : "Submit for Approval"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
