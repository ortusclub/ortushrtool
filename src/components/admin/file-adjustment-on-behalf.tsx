"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Save, X } from "lucide-react";
import type { ScheduleAdjustmentType, WorkLocation } from "@/types/database";

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

export function FileAdjustmentOnBehalf({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeSchedule, setEmployeeSchedule] = useState<{ day_of_week: number; work_location: string; is_rest_day: boolean }[]>([]);
  const [locationFilter, setLocationFilter] = useState<"all" | "online" | "office">("all");
  const [dateMode, setDateMode] = useState<"individual" | "range">("individual");
  const [dates, setDates] = useState<string[]>([""]);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<ScheduleAdjustmentType>("time");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState<WorkLocation>("office");
  const [reason, setReason] = useState("");

  const showTime = adjustmentType === "time" || adjustmentType === "both";
  const showLoc = adjustmentType === "location" || adjustmentType === "both";

  function getWeekdaysInRange(start: string, end: string): string[] {
    if (!start || !end || end < start) return [];
    const result: string[] = [];
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    while (cur <= endDate) {
      const dow = cur.getDay();
      if (dow >= 1 && dow <= 5) {
        result.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  const validDates =
    dateMode === "range"
      ? getWeekdaysInRange(rangeStart, rangeEnd)
      : dates.filter(Boolean);

  async function fetchEmployeeSchedule(id: string) {
    if (!id) { setEmployeeSchedule([]); return; }
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("schedules")
      .select("day_of_week, work_location, is_rest_day")
      .eq("employee_id", id)
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`);
    setEmployeeSchedule(data ?? []);
  }

  function getScheduledLocation(dateStr: string): string | null {
    const jsDay = new Date(dateStr + "T00:00:00").getDay();
    const dow = (jsDay + 6) % 7; // Mon=0
    const s = employeeSchedule.find((r) => r.day_of_week === dow);
    if (!s || s.is_rest_day) return null;
    return s.work_location;
  }

  const filteredDates = locationFilter === "all"
    ? validDates
    : validDates.filter((d) => getScheduledLocation(d) === locationFilter);

  const submit = async () => {
    if (!employeeId) { setError("Select an employee."); return; }
    if (filteredDates.length === 0) {
      setError(locationFilter !== "all"
        ? `No ${locationFilter} days found in the selected dates.`
        : "Pick at least one date.");
      return;
    }
    if (showTime && (!startTime || !endTime)) { setError("Set start and end times."); return; }
    if (!reason.trim()) { setError("Reason is required."); return; }

    setBusy(true);
    setError(null);
    let errors = 0;
    for (const date of filteredDates) {
      const res = await fetch("/api/schedule-adjustments/for-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          requested_date: date,
          adjustment_type: adjustmentType,
          requested_start_time: showTime ? startTime : undefined,
          requested_end_time: showTime ? endTime : undefined,
          requested_work_location: showLoc ? location : undefined,
          reason,
          queue: true,
        }),
      });
      if (!res.ok) errors++;
    }
    setBusy(false);
    if (errors > 0) { setError(`${errors} date(s) failed to submit.`); return; }
    setOpen(false);
    setEmployeeId("");
    setDates([""]);
    setRangeStart("");
    setRangeEnd("");
    setStartTime("");
    setEndTime("");
    setReason("");
    router.refresh();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-6 text-left hover:bg-gray-50"
      >
        <div>
          <h3 className="font-semibold text-gray-900">File Schedule Adjustment on Behalf</h3>
          <p className="text-sm text-gray-600">
            Submit a schedule adjustment for another employee — it goes through their manager&apos;s normal approval.
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
        <h3 className="text-sm font-semibold text-gray-800">File Schedule Adjustment on Behalf</h3>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Employee picker */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Employee</label>
        <select
          value={employeeId}
          onChange={e => {
            setEmployeeId(e.target.value);
            fetchEmployeeSchedule(e.target.value);
          }}
          className={inputClass}
        >
          <option value="">Select employee…</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{displayName(e)}</option>
          ))}
        </select>
      </div>

      {/* Date mode */}
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-600">Date(s)</label>
        <div className="mb-2 flex gap-4">
          {(["individual", "range"] as const).map(m => (
            <label key={m} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input type="radio" checked={dateMode === m} onChange={() => setDateMode(m)} className="h-4 w-4 text-blue-600" />
              {m === "individual" ? "Specific dates" : "Date range"}
            </label>
          ))}
        </div>

        {dateMode === "individual" ? (
          <div className="space-y-1">
            {dates.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="date" value={d} onChange={e => setDates(dates.map((v, idx) => idx === i ? e.target.value : v))} className={inputClass} />
                {dates.length > 1 && (
                  <button onClick={() => setDates(dates.filter((_, idx) => idx !== i))} className="rounded p-1 text-red-500 hover:bg-red-50"><X size={14} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setDates([...dates, ""])} className="text-xs font-medium text-blue-600 hover:text-blue-700">
              + Add another date
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">From</label>
              <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">To</label>
              <input type="date" value={rangeEnd} min={rangeStart} onChange={e => setRangeEnd(e.target.value)} className={inputClass} />
            </div>
            {validDates.length > 0 && (
              <p className="col-span-2 text-xs text-gray-500">
                {filteredDates.length} of {validDates.length} weekday{validDates.length !== 1 ? "s" : ""}
                {locationFilter !== "all" ? ` (${locationFilter} days only)` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Location filter */}
      {employeeSchedule.length > 0 && validDates.length > 0 && (
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">Apply to which days?</label>
          <div className="flex flex-wrap gap-4">
            {(["all", "online", "office"] as const).map(opt => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="radio" checked={locationFilter === opt} onChange={() => setLocationFilter(opt)} className="h-4 w-4 text-blue-600" />
                {opt === "all" ? "All days" : opt === "online" ? "Online days only" : "Office days only"}
              </label>
            ))}
          </div>
          {locationFilter !== "all" && filteredDates.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No {locationFilter} days found in the selected dates.</p>
          )}
        </div>
      )}

      {/* Type + times + location */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Change type</label>
          <select value={adjustmentType} onChange={e => setAdjustmentType(e.target.value as ScheduleAdjustmentType)} className={inputClass}>
            <option value="time">Time</option>
            <option value="location">Location</option>
            <option value="both">Both</option>
          </select>
        </div>
        {showTime && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Start time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">End time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </>
        )}
        {showLoc && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Location</label>
            <select value={location} onChange={e => setLocation(e.target.value as WorkLocation)} className={inputClass}>
              <option value="office">Office</option>
              <option value="online">Online</option>
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          <Save size={14} />{busy ? "Submitting…" : "Submit for Approval"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
