import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, formatDate } from "@/lib/utils";

const userCols = "full_name, preferred_name, first_name, last_name, email";

export default async function FeedbackReceivedPage() {
  const user = await getCurrentUser();
  const admin = createAdminClient();

  // Only fields the recipient is allowed to see — never the author.
  const { data: rows } = await admin
    .from("p2p_feedback")
    .select(
      `id, target_department, target_user_id, subject, message, hr_notes, reviewed_at,
       target:users!p2p_feedback_target_user_id_fkey(${userCols})`
    )
    .eq("recipient_user_id", user.id)
    .eq("status", "forwarded")
    .order("reviewed_at", { ascending: false });

  const feedback = rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Feedback forwarded to you
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Peer feedback HR has passed to you to deliver. It&apos;s anonymous —
            the author isn&apos;t shown.
          </p>
        </div>
        <Link
          href="/performance/feedback"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      {feedback.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          No feedback has been forwarded to you yet.
        </p>
      ) : (
        <div className="space-y-3">
          {feedback.map((f) => {
            const target = Array.isArray(f.target) ? f.target[0] : f.target;
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
                  {f.reviewed_at && (
                    <span className="text-gray-400">
                      forwarded {formatDate(f.reviewed_at)}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {f.subject}
                </p>
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {f.message}
                </p>
                {f.hr_notes && (
                  <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">
                    <strong>Note from HR:</strong> {f.hr_notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
