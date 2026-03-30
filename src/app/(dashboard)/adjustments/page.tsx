import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole, formatDate, formatTime } from "@/lib/utils";
import { AdjustmentActions } from "@/components/adjustments/adjustment-actions";
import Link from "next/link";

export default async function AdjustmentsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isReviewer = hasRole(user.role, "manager");

  let query = supabase
    .from("schedule_adjustments")
    .select("*, employee:users!schedule_adjustments_employee_id_fkey(*)")
    .order("created_at", { ascending: false });

  if (!isReviewer) {
    query = query.eq("employee_id", user.id);
  }

  const { data: adjustments } = await query;

  const pending = (adjustments ?? []).filter((a) => a.status === "pending");
  const past = (adjustments ?? []).filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isReviewer ? "Schedule Adjustment Approvals" : "My Adjustment Requests"}
          </h1>
          <p className="text-gray-600">
            {isReviewer
              ? "Review and approve schedule adjustment requests"
              : "Track your schedule adjustment requests"}
          </p>
        </div>
        {!isReviewer && (
          <Link
            href="/schedule/adjust"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Request
          </Link>
        )}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending ({pending.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pending.map((adj) => (
              <div key={adj.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    {isReviewer && adj.employee && (
                      <p className="font-medium text-gray-900">
                        {adj.employee.full_name || adj.employee.email}
                      </p>
                    )}
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Date:</span>{" "}
                      {formatDate(adj.requested_date)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Original:</span>{" "}
                      {formatTime(adj.original_start_time)} -{" "}
                      {formatTime(adj.original_end_time)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Requested:</span>{" "}
                      {formatTime(adj.requested_start_time)} -{" "}
                      {formatTime(adj.requested_end_time)}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Reason:</span> {adj.reason}
                    </p>
                  </div>
                  {isReviewer && (
                    <AdjustmentActions adjustmentId={adj.id} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {pending.length > 0 ? "History" : "All Requests"}
          </h2>
        </div>
        {past.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {past.map((adj) => (
              <div key={adj.id} className="flex items-center justify-between p-6">
                <div className="space-y-1">
                  {isReviewer && adj.employee && (
                    <p className="font-medium text-gray-900">
                      {adj.employee.full_name || adj.employee.email}
                    </p>
                  )}
                  <p className="text-sm text-gray-700">
                    {formatDate(adj.requested_date)} &mdash;{" "}
                    {formatTime(adj.requested_start_time)} -{" "}
                    {formatTime(adj.requested_end_time)}
                  </p>
                  <p className="text-sm text-gray-600">{adj.reason}</p>
                  {adj.reviewer_notes && (
                    <p className="text-sm text-gray-500 italic">
                      Note: {adj.reviewer_notes}
                    </p>
                  )}
                </div>
                <StatusBadge status={adj.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No adjustment requests yet.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${styles[status] ?? "bg-gray-100"}`}
    >
      {status}
    </span>
  );
}
