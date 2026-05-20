"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import type { LeaveStatus } from "@/types/database";

interface Props {
  leaveId: string;
  startDate: string;
  currentStatus: LeaveStatus;
}

export function CancelApprovedLeave({ leaveId, startDate, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (currentStatus !== "approved") return null;
  const today = new Date().toISOString().split("T")[0];
  if (startDate < today) return null;

  const handleCancel = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError, count } = await supabase
      .from("leave_requests")
      .update({ status: "cancelled" }, { count: "exact" })
      .eq("id", leaveId)
      .eq("status", "approved");

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    if (count === 0) {
      setError("You don't have permission to cancel this leave.");
      setLoading(false);
      return;
    }

    router.refresh();
  };

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "..." : "Confirm Cancel"}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={handleCancel}
      className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
    >
      <Ban size={14} />
      Cancel
    </button>
  );
}
