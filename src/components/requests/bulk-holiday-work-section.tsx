"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckSquare, Square, Check, X, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { formatDate, formatTime, displayName } from "@/lib/utils";
import { HolidayWorkActions } from "@/components/holiday-work/holiday-work-actions";
import { BuzzManager } from "@/components/shared/buzz-manager";
import { CancelRequest } from "@/components/shared/cancel-request";
import { EditHolidayWorkForm } from "@/components/admin/edit-holiday-work-form";
import { UserNameLink } from "@/components/shared/user-name-link";
import type { HolidayWorkCompensation, HolidayWorkDuration, WorkLocation } from "@/types/database";

type HW = {
  id: string;
  employee_id: string;
  holiday_date: string;
  duration: HolidayWorkDuration;
  start_time: string;
  end_time: string;
  work_location: WorkLocation;
  compensation: HolidayWorkCompensation;
  reason: string;
  holiday: { name: string } | null;
  employee: { full_name: string | null; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string } | null;
};

export function BulkHolidayWorkSection({
  requests,
  currentUserId,
  isReviewer,
  isAdmin,
  filters,
}: {
  requests: HW[];
  currentUserId: string;
  isReviewer: boolean;
  isAdmin: boolean;
  filters?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const approvableIds = requests.filter(h => h.employee_id !== currentUserId).map(h => h.id);
  const allSelected = approvableIds.length > 0 && approvableIds.every(id => selected.has(id));

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(approvableIds));
  }

  async function bulkDecide(status: "approved" | "rejected") {
    if (selected.size === 0) return;
    if (status === "rejected" && !confirm(`Reject ${selected.size} selected holiday work request(s)?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("holiday_work_requests").update({
      status,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }).in("id", [...selected]);
    setBusy(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-white shadow-sm">
      <div className="border-b border-teal-200 px-6 py-4">
        {filters && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2" onClick={(e) => e.stopPropagation()}>
            {filters}
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isReviewer && approvableIds.length > 0 && (
            <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
              {allSelected ? <CheckSquare size={18} className="text-teal-600" /> : <Square size={18} />}
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2">
            {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
            <h2 className="text-lg font-semibold text-gray-900">Pending Holiday Work Requests ({requests.length})</h2>
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
        {requests.length === 0 && (
          <p className="px-6 py-4 text-sm text-gray-500">No requests match these filters.</p>
        )}
        {requests.map((hw) => {
          const isOwn = hw.employee_id === currentUserId;
          return (
            <div key={hw.id} className={`p-6 ${selected.has(hw.id) ? "bg-teal-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {isReviewer && !isOwn ? (
                    <button onClick={() => toggle(hw.id)} className="mt-0.5 shrink-0 text-gray-400 hover:text-teal-600">
                      {selected.has(hw.id) ? <CheckSquare size={18} className="text-teal-600" /> : <Square size={18} />}
                    </button>
                  ) : <div className="w-[18px] shrink-0" />}
                  <div className="space-y-1">
                    {isReviewer && hw.employee && (
                      <p className="font-medium text-gray-900">
                        <UserNameLink userId={hw.employee_id} name={displayName(hw.employee)} />
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                        {hw.holiday?.name ?? "Holiday"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700"><span className="font-medium">Date:</span> {formatDate(hw.holiday_date)}</p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Hours:</span> {formatTime(hw.start_time)} – {formatTime(hw.end_time)}{" "}
                      <span className="ml-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                        {hw.duration === "half_day" ? "Half Day" : "Full Day"}
                      </span>
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Location:</span>{" "}
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${hw.work_location === "online" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {hw.work_location === "online" ? "Online" : "Office"}
                      </span>
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Compensation:</span>{" "}
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${hw.compensation === "cto" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                        {hw.compensation === "cto" ? "CTO Leave" : "Holiday Pay"}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">{hw.reason}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {isReviewer && !isOwn && <HolidayWorkActions requestId={hw.id} />}
                  {(!isReviewer || isOwn) && (
                    <>
                      <BuzzManager requestId={hw.id} requestType="holiday_work" />
                      <CancelRequest requestId={hw.id} table="holiday_work_requests" />
                    </>
                  )}
                  {isAdmin && !isOwn && <CancelRequest requestId={hw.id} table="holiday_work_requests" />}
                  {/* Owners can edit their own pending request (RLS
                      holiday_work_update_own_pending backs it). */}
                  {(isAdmin || isOwn) && (
                    <EditHolidayWorkForm
                      id={hw.id}
                      duration={hw.duration}
                      startTime={hw.start_time}
                      endTime={hw.end_time}
                      workLocation={hw.work_location}
                      compensation={hw.compensation}
                      reason={hw.reason}
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
