"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Check, X, RotateCcw } from "lucide-react";

interface Props {
  overtimeId: string;
  currentStatus?: "approved" | "rejected";
}

export function OvertimeActions({ overtimeId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (status: "approved" | "rejected") => {
    if (status === "rejected" && !showNotes) {
      setAction(status);
      setShowNotes(true);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: updErr } = await supabase
      .from("overtime_requests")
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes || null,
      })
      .eq("id", overtimeId);

    if (updErr) {
      setError(updErr.message);
      setLoading(false);
      return;
    }

    // Send the decision email in the background — don't make the UI wait on it.
    fetch("/api/notifications/overtime-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overtime_id: overtimeId,
        status,
        notes: notes || null,
      }),
    }).catch(() => {});

    setDone(status);
    setLoading(false);
    router.refresh();
  };

  if (done) {
    return (
      <span className={`flex items-center gap-1 text-xs font-medium ${done === "approved" ? "text-green-600" : "text-red-600"}`}>
        {done === "approved" ? <Check size={14} /> : <X size={14} />}
        {done === "approved" ? "Approved" : "Rejected"}
      </span>
    );
  }

  if (showNotes) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note (optional)..."
          rows={2}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => handleAction(action!)}
            disabled={loading}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "..." : "Confirm Reject"}
          </button>
          <button
            onClick={() => {
              setShowNotes(false);
              setAction(null);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (currentStatus) {
    return (
      <div className="flex gap-2">
        {currentStatus === "approved" ? (
          <button
            onClick={() => handleAction("rejected")}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Change to Reject
          </button>
        ) : (
          <button
            onClick={() => handleAction("approved")}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Change to Approve
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={() => handleAction("approved")}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <Check size={14} />
          {loading ? "Approving…" : "Approve"}
        </button>
        <button
          onClick={() => handleAction("rejected")}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          <X size={14} />
          Reject
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
