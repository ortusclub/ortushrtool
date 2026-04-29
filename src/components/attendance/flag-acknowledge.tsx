"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FlagAcknowledge({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAcknowledge = async () => {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/flags/${flagId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to acknowledge");
      setLoading(false);
      return;
    }

    router.refresh();
  };

  if (showNotes) {
    return (
      <div className="flex flex-col gap-2 min-w-[220px]">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Manager note (optional)..."
          rows={2}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : "Acknowledge"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNotes(false);
              setError(null);
            }}
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
      type="button"
      onClick={() => setShowNotes(true)}
      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
    >
      Acknowledge
    </button>
  );
}
