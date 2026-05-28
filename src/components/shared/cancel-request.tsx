"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

interface Props {
  requestId: string;
  table:
    | "schedule_adjustments"
    | "leave_requests"
    | "holiday_work_requests"
    | "overtime_requests"
    | "document_requests";
}

export function CancelRequest({ requestId, table }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteErr } = await supabase.from(table).delete().eq("id", requestId);
    setLoading(false);
    if (deleteErr) {
      setError(deleteErr.message);
      return;
    }
    setConfirming(false);
    router.refresh();
  };

  if (confirming) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "..." : "Confirm Cancel"}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null); }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600">Couldn&apos;t cancel: {error}</p>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleCancel}
      className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
    >
      <Trash2 size={14} />
      Cancel Request
    </button>
  );
}
