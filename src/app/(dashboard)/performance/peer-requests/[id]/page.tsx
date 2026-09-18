import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { displayName } from "@/lib/utils";
import { PeerFeedbackForm } from "@/components/performance/peer-feedback-form";
import type {
  PeerFeedbackRequest,
  Review,
  ReviewCycle,
  ReviewFormTemplate,
} from "@/types/database";

export default async function PeerResponsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("peer_feedback_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (!req) {
    return (
      <div className="space-y-4">
        <Link
          href="/performance"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Performance
        </Link>
        <p className="text-red-600">Request not found.</p>
      </div>
    );
  }
  const request = req as PeerFeedbackRequest;
  if (request.reviewer_id !== currentUser.id) {
    return (
      <div className="space-y-4">
        <Link
          href="/performance"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Performance
        </Link>
        <p className="text-red-600">
          This feedback request isn&apos;t for you.
        </p>
      </div>
    );
  }

  const { data: reviewRow } = await admin
    .from("reviews")
    .select("*")
    .eq("id", request.review_id)
    .single();
  const review = reviewRow as Review | null;
  if (!review) return null;

  const [{ data: cycleRow }, { data: empRow }] = await Promise.all([
    admin
      .from("review_cycles")
      .select("*")
      .eq("id", review.cycle_id)
      .single(),
    admin
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email")
      .eq("id", review.employee_id)
      .single(),
  ]);
  const cycle = cycleRow as ReviewCycle | null;
  if (!cycle) return null;

  const { data: tplRow } = cycle.template_id
    ? await admin
        .from("review_form_templates")
        .select("*")
        .eq("id", cycle.template_id)
        .single()
    : { data: null };
  const template = tplRow as ReviewFormTemplate | null;
  if (!template) return null;

  const employee = empRow as
    | {
        id: string;
        full_name: string;
        preferred_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string;
      }
    | null;
  const targetLabel = displayName(employee ?? null);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/performance"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Performance
        </Link>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">
          Peer feedback for {targetLabel}
        </h1>
        <p className="text-gray-600">
          {cycle.name} · template: {template.name}
          {cycle.peer_due && ` · due ${cycle.peer_due}`}
        </p>
      </div>
      <PeerFeedbackForm
        requestId={request.id}
        template={template}
        initialResponse={request.response}
        initialAnonymous={request.anonymous}
        alreadyCompleted={request.status === "completed"}
      />
    </div>
  );
}
