"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckSquare, Square, Check, X, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { formatDate, formatTime, displayName } from "@/lib/utils";
import { OvertimeActions } from "@/components/overtime/overtime-actions";
import { BuzzManager } from "@/components/shared/buzz-manager";
import { CancelRequest } from "@/components/shared/cancel-request";
import { EditOvertimeForm } from "@/components/admin/edit-overtime-form";
import { UserNameLink } from "@/components/shared/user-name-link";

type OT = {
  id: string;
  employee_id: string;
  requested_date: string;
  start_time: string;
  end_time: string;
  reason: string;
  employee: { full_name: string | null; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string } | null;
};

export function BulkOvertimeSection({
  requests,
  currentUserId,
  isReviewer,
  isAdmin,
}: {
  requests: OT[];
  currentUserId: string;
  isReviewer: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const approvableIds = requests.filter(o => o.employee_id !== currentUserId).map(o => o.id);
  const allSelected = approvableIds.length > 0 && approvableIds.every(id => selected.has(id));

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(approvableIds));
  }

  async function bulkDecide(status: "approved" | "rejected") {
    if (selected.size === 0) return;
    if (status === "rejected" && !confirm(`Reject ${selected.size} selected overtime request(s)?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("overtime_requests").update({
      status,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }).in("id", [...selected]);
    setBusy(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-white shadow-sm">
      <div className="border-b border-orange-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isReviewer && approvableIds.length > 0 && (
            <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
              {allSelected ? <CheckSquare size={18} className="text-orange-600" /> : <Square size={18} />}
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2">
            {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
            <h2 className="text-lg font-semibold text-gray-900">Pending Overtime Requests ({requests.length})</h2>
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
      {open && <div className="divide-y divide-gray-100">
        {requests.map((ot) => {
          const isOwn = ot.employee_id === currentUserId;
          return (
            <div key={ot.id} className={`p-6 ${selected.has(ot.id) ? "bg-orange-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {isReviewer && !isOwn ? (
                    <button onClick={() => toggle(ot.id)} className="mt-0.5 shrink-0 text-gray-400 hover:text-orange-600">
                      {selected.has(ot.id) ? <CheckSquare size={18} className="text-orange-600" /> : <Square size={18} />}
                    </button>
                  ) : <div className="w-[18px] shrink-0" />}
                  <div className="space-y-1">
                    {isReviewer && ot.employee && (
                      <p className="font-medium text-gray-900">
                        <UserNameLink userId={ot.employee_id} name={displayName(ot.employee)} />
                      </p>
                    )}
                    <p className="text-sm text-gray-700"><span className="font-medium">Date:</span> {formatDate(ot.requested_date)}</p>
                    <p className="text-sm text-gray-700"><span className="font-medium">Hours:</span> {formatTime(ot.start_time)} – {formatTime(ot.end_time)}</p>
                    <p className="text-sm text-gray-600">{ot.reason}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {isReviewer && !isOwn && <OvertimeActions overtimeId={ot.id} />}
                  {(!isReviewer || isOwn) && (
                    <>
                      <BuzzManager requestId={ot.id} requestType="overtime" />
                      <CancelRequest requestId={ot.id} table="overtime_requests" />
                    </>
                  )}
                  {isAdmin && !isOwn && <CancelRequest requestId={ot.id} table="overtime_requests" />}
                  {isAdmin && (
                    <EditOvertimeForm
                      id={ot.id}
                      requestedDate={ot.requested_date}
                      startTime={ot.start_time}
                      endTime={ot.end_time}
                      reason={ot.reason}
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
