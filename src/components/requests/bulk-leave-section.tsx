"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckSquare, Square, Check, X, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { formatDate, displayName } from "@/lib/utils";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { LeaveActions } from "@/components/leave/leave-actions";
import { CancelApprovedLeave } from "@/components/leave/cancel-approved-leave";
import { BuzzManager } from "@/components/shared/buzz-manager";
import { CancelRequest } from "@/components/shared/cancel-request";
import { EditLeaveForm } from "@/components/admin/edit-leave-form";
import { UserNameLink } from "@/components/shared/user-name-link";
import type { LeaveType, LeaveDuration } from "@/types/database";

type Leave = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  leave_duration: LeaveDuration;
  half_day_period: string | null;
  half_day_start_time: string | null;
  half_day_end_time: string | null;
  start_date: string;
  end_date: string;
  reason: string;
  employee: { full_name: string | null; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string } | null;
};

export function BulkLeaveSection({
  leaves,
  currentUserId,
  isReviewer,
  isAdmin,
  filters,
}: {
  leaves: Leave[];
  currentUserId: string;
  isReviewer: boolean;
  isAdmin: boolean;
  filters?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const approvableIds = leaves.filter(l => l.employee_id !== currentUserId).map(l => l.id);
  const allSelected = approvableIds.length > 0 && approvableIds.every(id => selected.has(id));

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(approvableIds));
  }

  async function bulkDecide(status: "approved" | "rejected") {
    if (selected.size === 0) return;
    if (status === "rejected" && !confirm(`Reject ${selected.size} selected leave request(s)?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("leave_requests").update({
      status,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }).in("id", [...selected]);
    setBusy(false);
    setSelected(new Set());
    router.refresh();
  }

  const leaveTypeLabels = LEAVE_TYPE_LABELS;

  return (
    <div className="rounded-xl border border-purple-200 bg-white shadow-sm">
      <div className="border-b border-purple-200 px-6 py-4">
        {filters && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2" onClick={(e) => e.stopPropagation()}>
            {filters}
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isReviewer && approvableIds.length > 0 && (
            <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
              {allSelected ? <CheckSquare size={18} className="text-purple-600" /> : <Square size={18} />}
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2">
            {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Leave Requests ({leaves.length})
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
            <button onClick={() => bulkDecide("approved")} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <Check size={15} />
              {busy ? "Working…" : `Approve ${selected.size}`}
            </button>
            <button onClick={() => bulkDecide("rejected")} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              <X size={15} />
              {busy ? "Working…" : `Reject ${selected.size}`}
            </button>
          </div>
        )}
        </div>
      </div>
      {open && <div className="divide-y divide-gray-100">
        {leaves.length === 0 && (
          <p className="px-6 py-4 text-sm text-gray-500">No requests match these filters.</p>
        )}
        {leaves.map((leave) => {
          const isOwn = leave.employee_id === currentUserId;
          return (
            <div key={leave.id} className={`p-6 ${selected.has(leave.id) ? "bg-purple-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {isReviewer && !isOwn ? (
                    <button onClick={() => toggle(leave.id)} className="mt-0.5 shrink-0 text-gray-400 hover:text-purple-600">
                      {selected.has(leave.id) ? <CheckSquare size={18} className="text-purple-600" /> : <Square size={18} />}
                    </button>
                  ) : <div className="w-[18px] shrink-0" />}
                  <div className="space-y-1">
                    {isReviewer && leave.employee && (
                      <p className="font-medium text-gray-900">
                        <UserNameLink userId={leave.employee_id} name={displayName(leave.employee)} />
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {leaveTypeLabels[leave.leave_type] ?? leave.leave_type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">
                      {leave.leave_duration === "half_day" ? (
                        <>
                          <span className="font-medium">Date:</span> {formatDate(leave.start_date)}
                          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                            Half day ({leave.half_day_period === "am" ? "AM" : "PM"})
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium">From:</span> {formatDate(leave.start_date)} &mdash;{" "}
                          <span className="font-medium">To:</span> {formatDate(leave.end_date)}
                        </>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">{leave.reason}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {isReviewer && !isOwn && <LeaveActions leaveId={leave.id} />}
                  {(!isReviewer || isOwn) && (
                    <>
                      <BuzzManager requestId={leave.id} requestType="leave" />
                      <CancelRequest requestId={leave.id} table="leave_requests" />
                    </>
                  )}
                  {isAdmin && !isOwn && <CancelRequest requestId={leave.id} table="leave_requests" />}
                  {/* Owners can edit their own request here (these are all
                      pending); RLS leave_update_own_pending backs it. */}
                  {(isAdmin || isOwn) && (
                    <EditLeaveForm
                      id={leave.id}
                      leaveType={leave.leave_type}
                      leaveDuration={leave.leave_duration}
                      halfDayPeriod={leave.half_day_period}
                      startDate={leave.start_date}
                      endDate={leave.end_date}
                      reason={leave.reason}
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
