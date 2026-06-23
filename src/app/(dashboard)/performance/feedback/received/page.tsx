import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/utils";
import {
  ReceivedFeedbackList,
  type ReceivedFeedbackItem,
} from "@/components/performance/received-feedback-list";

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

  const items: ReceivedFeedbackItem[] = (rows ?? []).map((f) => {
    const target = Array.isArray(f.target) ? f.target[0] : f.target;
    return {
      id: f.id,
      department: f.target_department,
      targetName: target ? displayName(target) : null,
      subject: f.subject,
      message: f.message,
      hrNotes: f.hr_notes,
      forwardedAt: f.reviewed_at,
    };
  });

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

      <ReceivedFeedbackList items={items} />
    </div>
  );
}
