"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export function HolidayWorkActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);

  const handleAction = async (status: "approved" | "rejected") => {
    if (status === "rejected" && !showNotes) {
      setAction(status);
      setShowNotes(true);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase
      .from("holiday_work_requests")
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes || null,
      })
      .eq("id", requestId);

    try {
      await fetch("/api/notifications/holiday-work-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, status, notes }),
      });
    } catch {
      // Non-blocking
    }

    router.refresh();
  };

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
            onClick={() => { setShowNotes(false); setAction(null); }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleAction("approved")}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        <Check size={14} />
        Approve
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
  );
}
