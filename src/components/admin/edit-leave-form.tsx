"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Save, X } from "lucide-react";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import type { LeaveType, LeaveDuration } from "@/types/database";

interface Props {
  id: string;
  leaveType: LeaveType;
  leaveDuration: LeaveDuration;
  halfDayPeriod: string | null;
  startDate: string;
  endDate: string;
  reason: string;
}

const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function EditLeaveForm(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    leave_type: props.leaveType,
    leave_duration: props.leaveDuration,
    half_day_period: props.halfDayPeriod ?? "am",
    start_date: props.startDate,
    end_date: props.endDate,
    reason: props.reason,
  });

  const isHalfDay = form.leave_duration === "half_day";

  const save = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("leave_requests").update({
      leave_type: form.leave_type,
      leave_duration: form.leave_duration,
      half_day_period: isHalfDay ? form.half_day_period : null,
      start_date: form.start_date,
      end_date: isHalfDay ? form.start_date : form.end_date,
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
    <div className="mt-3 space-y-3 rounded-lg border border-purple-200 bg-purple-50/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Edit request</p>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={13} /></button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Leave type</label>
          <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value as LeaveType }))} className={inputClass}>
            {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Duration</label>
          <select value={form.leave_duration} onChange={e => setForm(f => ({ ...f, leave_duration: e.target.value as LeaveDuration }))} className={inputClass}>
            <option value="full_day">Full day</option>
            <option value="half_day">Half day</option>
          </select>
        </div>
        {isHalfDay ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Period</label>
              <select value={form.half_day_period} onChange={e => setForm(f => ({ ...f, half_day_period: e.target.value }))} className={inputClass}>
                <option value="am">AM</option>
                <option value="pm">PM</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
              <input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputClass} />
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
          <textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={inputClass} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50">
          <Save size={12} />{busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
