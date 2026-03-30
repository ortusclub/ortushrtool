"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function FlagAcknowledge({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");

  const handleAcknowledge = async () => {
    setLoading(true);
    const supabase = createClient();

    await supabase
      .from("attendance_flags")
      .update({
        acknowledged: true,
        notes: notes || null,
      })
      .eq("id", flagId);

    router.refresh();
  };

  if (showNotes) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add explanation (optional)..."
          rows={2}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={handleAcknowledge}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : "Submit"}
          </button>
          <button
            onClick={() => setShowNotes(false)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowNotes(true)}
      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
    >
      Acknowledge
    </button>
  );
}
