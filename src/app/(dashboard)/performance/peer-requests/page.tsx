import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import { displayName } from "@/lib/utils";
import type { PeerFeedbackRequest } from "@/types/database";

export default async function PerformancePeerRequestsPage() {
  const user = await getCurrentUser();
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("peer_feedback_requests")
    .select(
      "id, status, anonymous, review_id, created_at, completed_at, review:reviews!peer_feedback_requests_review_id_fkey(employee:users!reviews_employee_id_fkey(id, full_name, preferred_name, first_name, last_name, email), cycle:review_cycles!reviews_cycle_id_fkey(name, peer_due))"
    )
    .eq("reviewer_id", user.id)
    .order("created_at", { ascending: false });

  type PeerInboxRow = Pick<
    PeerFeedbackRequest,
    "id" | "status" | "anonymous" | "review_id" | "created_at" | "completed_at"
  > & {
    review:
      | Array<{
          employee:
            | Array<{
                id: string;
                full_name: string;
                preferred_name: string | null;
                first_name: string | null;
                last_name: string | null;
                email: string;
              }>
            | null;
          cycle: Array<{ name: string; peer_due: string | null }> | null;
        }>
      | null;
  };
  const requests = ((rows ?? []) as unknown as PeerInboxRow[]).map((r) => {
    const rev = Array.isArray(r.review) && r.review.length > 0 ? r.review[0] : null;
    const emp =
      rev && Array.isArray(rev.employee) && rev.employee.length > 0
        ? rev.employee[0]
        : null;
    const cyc =
      rev && Array.isArray(rev.cycle) && rev.cycle.length > 0 ? rev.cycle[0] : null;
    return {
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      employee: emp,
      cycleName: cyc?.name ?? null,
      peerDue: cyc?.peer_due ?? null,
    };
  });
  const pending = requests.filter((r) => r.status === "pending");
  const completed = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 font-display text-sm uppercase tracking-wide text-gray-500">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Nothing waiting on you.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {r.employee ? displayName(r.employee) : "Someone"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.cycleName}
                    {r.peerDue && (
                      <> · due {format(parseISO(r.peerDue), "MMM d")}</>
                    )}
                    {" · "}
                    {format(parseISO(r.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                <Link
                  href={`/performance/peer-requests/${r.id}`}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Respond <ArrowRight size={12} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {completed.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm uppercase tracking-wide text-gray-500">
            Past requests
          </h2>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {completed.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {r.employee ? displayName(r.employee) : "Someone"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.cycleName} ·{" "}
                    {r.completed_at
                      ? format(parseISO(r.completed_at), "MMM d, yyyy")
                      : format(parseISO(r.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    r.status === "completed"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
