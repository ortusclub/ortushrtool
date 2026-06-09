"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckSquare, Square, Check, X, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { formatDate, formatTime, displayName } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { AdjustmentActions } from "@/components/adjustments/adjustment-actions";
import { BuzzManager } from "@/components/shared/buzz-manager";
import { CancelRequest } from "@/components/shared/cancel-request";
import { EditAdjustmentForm } from "@/components/admin/edit-adjustment-form";
import { UserNameLink } from "@/components/shared/user-name-link";
import type { ScheduleAdjustmentType, WorkLocation } from "@/types/database";

type Adj = {
  id: string;
  employee_id: string;
  requested_date: string;
  adjustment_type: ScheduleAdjustmentType;
  original_start_time: string;
  original_end_time: string;
  requested_start_time: string;
  requested_end_time: string;
  requested_work_location: WorkLocation | null;
  reason: string;
  employee: { full_name: string | null; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string; role: string } | null;
};

type Warning = { officeDays: number; threshold: number };

export function BulkAdjustmentsSection({
  adjustments,
  officeWarnings,
  currentUserId,
  isReviewer,
  isAdmin,
  filters,
}: {
  adjustments: Adj[];
  officeWarnings: Record<string, Warning>;
  currentUserId: string;
  isReviewer: boolean;
  isAdmin: boolean;
  filters?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const approvableIds = adjustments
    .filter(a => a.employee_id !== currentUserId)
    .map(a => a.id);

  const allSelected = approvableIds.length > 0 && approvableIds.every(id => selected.has(id));

  function toggle(id: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(approvableIds));
  }

  async function bulkDecide(status: "approved" | "rejected") {
    if (selected.size === 0) return;
    if (status === "rejected" && !confirm(`Reject ${selected.size} selected schedule adjustment(s)?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("schedule_adjustments").update({
      status,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }).in("id", [...selected]);
    setBusy(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        {filters && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2" onClick={(e) => e.stopPropagation()}>
            {filters}
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isReviewer && approvableIds.length > 0 && (
            <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
              {allSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2">
            {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Schedule Adjustments ({adjustments.length})
            </h2>
            {approvableIds.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Flag size={11} /> {approvableIds.length} need action
              </span>
            )}
          </button>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => bulkDecide("approved")}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check size={15} />
              {busy ? "Working…" : `Approve ${selected.size}`}
            </button>
            <button
              onClick={() => bulkDecide("rejected")}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <X size={15} />
              {busy ? "Working…" : `Reject ${selected.size}`}
            </button>
          </div>
        )}
        </div>
      </div>
      {open && <div className="divide-y divide-gray-100">
        {adjustments.length === 0 && (
          <p className="px-6 py-4 text-sm text-gray-500">No requests match these filters.</p>
        )}
        {adjustments.map((adj) => {
          const warning = officeWarnings[adj.id];
          const isOwn = adj.employee_id === currentUserId;
          const isSelectable = isReviewer && !isOwn;
          return (
            <div key={adj.id} className={`p-6 ${selected.has(adj.id) ? "bg-blue-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {isSelectable ? (
                    <button onClick={() => toggle(adj.id)} className="mt-0.5 shrink-0 text-gray-400 hover:text-blue-600">
                      {selected.has(adj.id)
                        ? <CheckSquare size={18} className="text-blue-600" />
                        : <Square size={18} />}
                    </button>
                  ) : (
                    <div className="w-[18px] shrink-0" />
                  )}
                  <div className="space-y-1">
                    {isReviewer && adj.employee && (
                      <p className="font-medium text-gray-900">
                        <UserNameLink userId={adj.employee_id} name={displayName(adj.employee)} />
                      </p>
                    )}
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Date:</span> {formatDate(adj.requested_date)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Original:</span>{" "}
                      {formatTime(adj.original_start_time)} – {formatTime(adj.original_end_time)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Requested:</span>{" "}
                      {formatTime(adj.requested_start_time)} – {formatTime(adj.requested_end_time)}
                    </p>
                    {adj.requested_work_location && (
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Location:</span>{" "}
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${adj.requested_work_location === "office" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                          {adj.requested_work_location === "office" ? "Office" : "Online"}
                        </span>
                      </p>
                    )}
                    <p className="text-sm text-gray-600">{adj.reason}</p>
                    {warning && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                        <AlertTriangle size={14} className="text-red-500 shrink-0" />
                        <span className="text-xs text-red-700">
                          Approving this would leave only {warning.officeDays} office day{warning.officeDays !== 1 ? "s" : ""} this week (minimum {warning.threshold} required)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {isReviewer && !isOwn && <AdjustmentActions adjustmentId={adj.id} />}
                  {(!isReviewer || isOwn) && (
                    <>
                      <BuzzManager requestId={adj.id} requestType="schedule_adjustment" />
                      <CancelRequest requestId={adj.id} table="schedule_adjustments" />
                    </>
                  )}
                  {isAdmin && !isOwn && <CancelRequest requestId={adj.id} table="schedule_adjustments" />}
                  {isAdmin && (
                    <EditAdjustmentForm
                      id={adj.id}
                      requestedDate={adj.requested_date}
                      adjustmentType={adj.adjustment_type}
                      requestedStartTime={adj.requested_start_time}
                      requestedEndTime={adj.requested_end_time}
                      requestedWorkLocation={adj.requested_work_location}
                      reason={adj.reason}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}
