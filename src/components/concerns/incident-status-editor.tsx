"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  INCIDENT_STATUS_LABELS,
  type IncidentStatus,
} from "@/types/database";

export function IncidentStatusEditor({
  reportId,
  initialStatus,
  initialNotes,
}: {
  reportId: string;
  initialStatus: IncidentStatus;
  initialNotes: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<IncidentStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("incident_reports")
      .update({
        status,
        handler_notes: notes.trim() || null,
        handled_by: authUser?.id ?? null,
        handled_at: new Date().toISOString(),
      })
      .eq("id", reportId);
    setSaving(false);
    if (error) {
      setMessage(`Save failed: ${error.message}`);
      return;
    }
    setMessage("Saved.");
    router.refresh();
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-700">HR review</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as IncidentStatus)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {(
              Object.entries(INCIDENT_STATUS_LABELS) as [IncidentStatus, string][]
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">
          Handler notes (visible to reporter)
        </label>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What action HR is taking, findings, next steps…"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    </div>
  );
}
