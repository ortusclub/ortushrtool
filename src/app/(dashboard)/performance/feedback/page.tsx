import Link from "next/link";
import { ShieldCheck, Inbox } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, hasRole, formatDate } from "@/lib/utils";
import {
  P2P_FEEDBACK_STATUS_LABELS,
  type P2PFeedbackStatus,
} from "@/types/database";
import {
  FeedbackForm,
  type FeedbackCandidate,
} from "@/components/performance/feedback-form";

const statusStyles: Record<P2PFeedbackStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  forwarded: "bg-green-100 text-green-700",
  dismissed: "bg-gray-200 text-gray-700",
};

export default async function PerformanceFeedbackPage() {
  const user = await getCurrentUser();
  const admin = createAdminClient();

  const { data: usersData } = await admin
    .from("users")
    .select(
      "id, full_name, preferred_name, first_name, last_name, email, department"
    )
    .eq("is_active", true)
    .order("full_name");

  const candidates: FeedbackCandidate[] = (usersData ?? []).map((u) => ({
    id: u.id,
    full_name: u.full_name,
    preferred_name: u.preferred_name,
    first_name: u.first_name,
    last_name: u.last_name,
    email: u.email,
    department: u.department,
  }));

  const departments = Array.from(
    new Set(candidates.map((c) => c.department).filter(Boolean))
  ).sort() as string[];

  const { data: mine } = await admin
    .from("p2p_feedback")
    .select(
      "id, target_department, subject, status, created_at, target:users!p2p_feedback_target_user_id_fkey(full_name, preferred_name, first_name, last_name, email)"
    )
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const { count: receivedCount } = await admin
    .from("p2p_feedback")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", user.id)
    .eq("status", "forwarded");

  const isHR = hasRole(user.role, "hr_admin");
  const hasReceived = (receivedCount ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Peer Feedback
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Share feedback for a team or colleague. It stays anonymous to the
            recipient.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasReceived && (
            <Link
              href="/performance/feedback/received"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Inbox size={14} /> View feedback ({receivedCount})
            </Link>
          )}
          {isHR && (
            <Link
              href="/performance/feedback/review"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ShieldCheck size={14} /> Review queue
            </Link>
          )}
        </div>
      </div>

      <FeedbackForm
        currentUserId={user.id}
        departments={departments}
        candidates={candidates}
      />

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Your submissions
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {!mine || mine.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">
              You haven&apos;t submitted any feedback yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {mine.map((f) => {
                const target = Array.isArray(f.target)
                  ? f.target[0]
                  : f.target;
                return (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-4 px-6 py-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {f.subject}
                      </p>
                      <p className="text-xs text-gray-500">
                        {f.target_department}
                        {target ? ` · ${displayName(target)}` : ""} ·{" "}
                        {formatDate(f.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusStyles[f.status as P2PFeedbackStatus] ??
                        "bg-gray-100"
                      }`}
                    >
                      {P2P_FEEDBACK_STATUS_LABELS[
                        f.status as P2PFeedbackStatus
                      ] ?? f.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
