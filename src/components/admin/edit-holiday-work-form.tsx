"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Save, X } from "lucide-react";
import type { HolidayWorkCompensation, HolidayWorkDuration, WorkLocation } from "@/types/database";

interface Props {
  id: string;
  duration: HolidayWorkDuration;
  startTime: string;
  endTime: string;
  workLocation: WorkLocation;
  compensation: HolidayWorkCompensation;
  reason: string;
}

const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function EditHolidayWorkForm(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    duration: props.duration,
    start_time: props.startTime,
    end_time: props.endTime,
    work_location: props.workLocation,
    compensation: props.compensation,
    reason: props.reason,
  });

  const save = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("holiday_work_requests").update({
      duration: form.duration,
      start_time: form.start_time,
      end_time: form.end_time,
      work_location: form.work_location,
      compensation: form.compensation,
      reason: form.reason,
    }).eq("id", props.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
        <Pencil size={12} /> Edit
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-teal-200 bg-teal-50/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Edit request</p>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={13} /></button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Duration</label>
          <select value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value as HolidayWorkDuration }))} className={inputClass}>
            <option value="full_day">Full day</option>
            <option value="half_day">Half day</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Location</label>
          <select value={form.work_location} onChange={e => setForm(f => ({ ...f, work_location: e.target.value as WorkLocation }))} className={inputClass}>
            <option value="office">Office</option>
            <option value="online">Online</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Start time</label>
          <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">End time</label>
          <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Compensation</label>
          <select value={form.compensation} onChange={e => setForm(f => ({ ...f, compensation: e.target.value as HolidayWorkCompensation }))} className={inputClass}>
            <option value="holiday_pay">Holiday Pay</option>
            <option value="cto">CTO Leave</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
          <textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={inputClass} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          <Save size={12} />{busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
