"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { PeoplePicker, type PickerUser } from "@/components/performance/people-picker";

interface Props {
  feedbackId: string;
  candidates: PickerUser[];
  /** Suggested recipient (a manager in the target department), pre-selected. */
  defaultRecipientId: string | null;
}

export function FeedbackReviewActions({
  feedbackId,
  candidates,
  defaultRecipientId,
}: Props) {
  const router = useRouter();
  const [recipientIds, setRecipientIds] = useState<string[]>(
    defaultRecipientId ? [defaultRecipientId] : []
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (action: "forward" | "dismiss") => {
    if (action === "forward" && recipientIds.length === 0) {
      setError("Pick someone to forward this to.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/performance/feedback/${feedbackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        recipient_user_id: action === "forward" ? recipientIds[0] : undefined,
        hr_notes: notes.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action failed.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-700/30">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-200">
          Forward to (manager / department head)
        </label>
        <div className="mt-1">
          <PeoplePicker
            candidates={candidates}
            selectedIds={recipientIds}
            onChange={setRecipientIds}
            placeholder="Search a recipient…"
            singleSelect
          />
        </div>
      </div>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional note for the recipient…"
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act("forward")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Send size={12} />
          )}
          Forward
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("dismiss")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <X size={12} /> Dismiss
        </button>
      </div>
    </div>
  );
}
