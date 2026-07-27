import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, formatDate } from "@/lib/utils";
import {
  P2P_FEEDBACK_STATUS_LABELS,
  type P2PFeedbackStatus,
  type P2PFeedbackWithUsers,
} from "@/types/database";
import { FeedbackReviewActions } from "@/components/performance/feedback-review-actions";
import type { PickerUser } from "@/components/performance/people-picker";

const statusStyles: Record<P2PFeedbackStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  forwarded: "bg-green-100 text-green-700",
  dismissed: "bg-gray-200 text-gray-700",
};

const userCols =
  "full_name, preferred_name, first_name, last_name, email";

export default async function FeedbackReviewPage() {
  await requireRole("hr_admin");
  const admin = createAdminClient();

  const [{ data: rows }, { data: usersData }] = await Promise.all([
    admin
      .from("p2p_feedback")
      .select(
        `id, author_id, target_department, target_user_id, subject, message, status, recipient_user_id, recipient_user_ids, hr_notes, reviewed_at, created_at,
         author:users!p2p_feedback_author_id_fkey(${userCols}),
         target:users!p2p_feedback_target_user_id_fkey(${userCols})`
      )
      .order("created_at", { ascending: false }),
    admin
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email, role, department, job_title")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const feedback = (rows ?? []) as unknown as P2PFeedbackWithUsers[];
  const users = usersData ?? [];

  // Resolve recipient names for the "forwarded to …" line. recipient_user_ids
  // is an array column (no FK join), so look names up from the loaded users.
  const usersById = new Map(users.map((u) => [u.id, u]));
  const recipientNames = (f: P2PFeedbackWithUsers): string[] =>
    (f.recipient_user_ids ?? [])
      .map((rid) => {
        const u = usersById.get(rid);
        return u ? displayName(u) : null;
      })
      .filter((n): n is string => n !== null);

  const candidates: PickerUser[] = users.map((u) => ({
    id: u.id,
    full_name: u.full_name,
    preferred_name: u.preferred_name,
    first_name: u.first_name,
    last_name: u.last_name,
    email: u.email,
  }));

  // Suggested recipient for a department = its "head". There's no head field,
  // so infer it from the people in that department who hold an elevated role,
  // preferring a "Head/Director/Lead" job title, then role seniority, then name.
  // (HR can always override in the picker.)
  const roleRank: Record<string, number> = {
    manager: 1,
    hr_admin: 2,
    super_admin: 3,
  };
  const isHeadTitle = (title: string | null) =>
    /head|director|chief|lead/i.test(title ?? "");
  const defaultRecipientFor = (dept: string): string | null => {
    const inDept = users.filter(
      (u) => u.department === dept && roleRank[u.role] !== undefined
    );
    if (inDept.length === 0) return null;
    inDept.sort((a, b) => {
      const headDiff =
        Number(isHeadTitle(b.job_title)) - Number(isHeadTitle(a.job_title));
      if (headDiff !== 0) return headDiff;
      const rankDiff = (roleRank[b.role] ?? 0) - (roleRank[a.role] ?? 0);
      if (rankDiff !== 0) return rankDiff;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
    return inDept[0].id;
  };

  const pending = feedback.filter((f) => f.status === "new");
  const actioned = feedback.filter((f) => f.status !== "new");

  const one = (j: P2PFeedbackWithUsers["author"]) =>
    Array.isArray(j) ? j[0] : j;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Peer Feedback — HR review
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Forward feedback to a manager/department head, or dismiss it. The
            author&apos;s name is shown to you only.
          </p>
        </div>
        <Link
          href="/performance/feedback"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Pending ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
            Nothing waiting for review.
          </p>
        ) : (
          pending.map((f) => {
            const author = one(f.author);
            const target = one(f.target);
            return (
              <div
                key={f.id}
                className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {f.target_department}
                    {target ? ` · ${displayName(target)}` : ""}
                  </span>
                  <span className="text-gray-400">
                    from {author ? displayName(author) : "unknown"} ·{" "}
                    {formatDate(f.created_at)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {f.subject}
                </p>
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {f.message}
                </p>
                <FeedbackReviewActions
                  feedbackId={f.id}
                  candidates={candidates}
                  defaultRecipientId={defaultRecipientFor(f.target_department)}
                />
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Actioned ({actioned.length})
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {actioned.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">
              Nothing actioned yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {actioned.map((f) => {
                const author = one(f.author);
                const recipients = recipientNames(f);
                return (
                  <li key={f.id} className="space-y-1 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {f.subject}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusStyles[f.status] ?? "bg-gray-100"
                        }`}
                      >
                        {P2P_FEEDBACK_STATUS_LABELS[f.status] ?? f.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {f.target_department} · from{" "}
                      {author ? displayName(author) : "unknown"}
                      {f.status === "forwarded" && recipients.length > 0
                        ? ` · forwarded to ${recipients.join(", ")}`
                        : ""}
                      {f.reviewed_at ? ` · ${formatDate(f.reviewed_at)}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
