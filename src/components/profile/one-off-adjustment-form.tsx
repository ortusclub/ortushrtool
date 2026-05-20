"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X } from "lucide-react";
import type { ScheduleAdjustmentType, WorkLocation } from "@/types/database";
import { hasNightDifferentialHours } from "@/lib/utils";
import { NightDiffBanner } from "@/components/shared/night-diff-banner";

export function OneOffAdjustmentForm({
  employeeId,
  submitMode,
}: {
  employeeId: string;
  submitMode: "direct" | "queue";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([""]);
  const [adjustmentType, setAdjustmentType] =
    useState<ScheduleAdjustmentType>("time");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState<WorkLocation>("office");
  const [reason, setReason] = useState("");

  const showTime = adjustmentType === "time" || adjustmentType === "both";
  const showLoc = adjustmentType === "location" || adjustmentType === "both";

  const addDate = () => setDates([...dates, ""]);
  const removeDate = (i: number) => setDates(dates.filter((_, idx) => idx !== i));
  const updateDate = (i: number, v: string) =>
    setDates(dates.map((d, idx) => (idx === i ? v : d)));

  const submit = async () => {
    const valid = dates.filter(Boolean);
    if (valid.length === 0) {
      setError("Pick at least one date.");
      return;
    }
    if (showTime && (!startTime || !endTime)) {
      setError("Set start and end times.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);

    let errors = 0;
    for (const date of valid) {
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
        }),
      });
      if (!res.ok) errors++;
    }
    setBusy(false);

    if (errors > 0) {
      setError(`Created with ${errors} error(s).`);
      return;
    }
    setMessage(
      submitMode === "queue"
        ? `Adjustment request submitted for ${valid.length} date(s).`
        : `Adjustment added for ${valid.length} date(s) — auto-approved.`
    );
    setDates([""]);
    setStartTime("");
    setEndTime("");
    setReason("");
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <div className="space-y-2">
        {message && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setOpen(true);
          }}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus size={12} /> Add one-off adjustment
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          Add one-off adjustment
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-gray-500 hover:bg-gray-100"
        >
          <X size={14} />
        </button>
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Date(s)
        </label>
        <div className="space-y-1">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="date"
                value={d}
                onChange={(e) => updateDate(i, e.target.value)}
                className={inputClass}
              />
              {dates.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDate(i)}
                  className="rounded p-1 text-red-500 hover:bg-red-50"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addDate}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} /> Add another date
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Change type">
          <select
            value={adjustmentType}
            onChange={(e) =>
              setAdjustmentType(e.target.value as ScheduleAdjustmentType)
            }
            className={inputClass}
          >
            <option value="time">Time</option>
            <option value="location">Working Location</option>
            <option value="both">Both</option>
          </select>
        </Field>
        {showTime && (
          <>
            <Field label="Start time">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
            </Field>
          </>
        )}
        {showLoc && (
          <Field label="Working Location">
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as WorkLocation)}
              className={inputClass}
            >
              <option value="office">Office</option>
              <option value="online">Online</option>
            </select>
          </Field>
        )}
        <Field label="Reason" full>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {showTime && hasNightDifferentialHours(startTime, endTime) && (
        <NightDiffBanner />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={12} />
          {busy
            ? "Submitting..."
            : submitMode === "queue"
              ? "Submit request"
              : "Add adjustment"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      {children}
    </div>
  );
}
