"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Save, X } from "lucide-react";

interface Props {
  id: string;
  requestedDate: string;
  startTime: string;
  endTime: string;
  reason: string;
}

const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function EditOvertimeForm(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    requested_date: props.requestedDate,
    start_time: props.startTime,
    end_time: props.endTime,
    reason: props.reason,
  });

  const save = async () => {
    if (form.start_time && form.end_time && form.start_time === form.end_time) {
      setError("Start and end time cannot be the same.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("overtime_requests").update({
      requested_date: form.requested_date,
      start_time: form.start_time,
      end_time: form.end_time,
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
    <div className="mt-3 space-y-3 rounded-lg border border-orange-200 bg-orange-50/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Edit request</p>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={13} /></button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
          <input type="date" value={form.requested_date} onChange={e => setForm(f => ({ ...f, requested_date: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Start time
          </label>
          <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            End time{form.start_time && form.end_time && form.end_time < form.start_time && (
              <span className="ml-1 text-xs font-normal text-amber-600">(next day)</span>
            )}
          </label>
          <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
          <textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={inputClass} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50">
          <Save size={12} />{busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
