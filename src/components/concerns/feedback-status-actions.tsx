"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FeedbackStatus } from "@/types/database";

const transitions: Record<FeedbackStatus, { label: string; next: FeedbackStatus }[]> = {
  new: [
    { label: "Mark Reviewed", next: "reviewed" },
    { label: "Archive", next: "archived" },
  ],
  reviewed: [{ label: "Archive", next: "archived" }],
  archived: [{ label: "Reopen", next: "new" }],
};

export function FeedbackStatusActions({
  feedbackId,
  currentStatus,
}: {
  feedbackId: string;
  currentStatus: FeedbackStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const setStatus = async (next: FeedbackStatus) => {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("anonymous_feedback")
      .update({
        status: next,
        reviewed_at: next === "reviewed" ? new Date().toISOString() : null,
      })
      .eq("id", feedbackId);
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="flex gap-2">
      {transitions[currentStatus].map((t) => (
        <button
          key={t.next}
          type="button"
          disabled={loading}
          onClick={() => setStatus(t.next)}
          className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
