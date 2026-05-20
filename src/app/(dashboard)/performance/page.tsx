import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, Heart, Target, Users, CalendarClock, Lock } from "lucide-react";
import { displayName } from "@/lib/utils";
import type {
  Review,
  ReviewCycle,
  PeerFeedbackRequest,
  KudosWithUsers,
} from "@/types/database";

export default async function PerformanceOverviewPage() {
  const user = await getCurrentUser();
  const admin = createAdminClient();

  // Reviews + independent counts can run in parallel. Cycles depend on
  // reviews so it's a second round-trip.
  const [
    { data: reviewsData },
    { count: pendingPeerCount },
    { data: kudosRows },
    { count: kpiCount },
    { count: oneOnOneCount },
  ] = await Promise.all([
    admin
      .from("reviews")
      .select("id, cycle_id, status")
      .eq("employee_id", user.id),
    admin
      .from("peer_feedback_requests")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", user.id)
      .eq("status", "pending"),
    admin
      .from("kudos")
      .select(
        "*, sender:users!kudos_sender_id_fkey(full_name, preferred_name, first_name, last_name, email)"
      )
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    admin
      .from("kpi_assignments")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", user.id)
      .eq("status", "active"),
    admin
      .from("one_on_ones")
      .select("id", { count: "exact", head: true })
      .or(`employee_id.eq.${user.id},manager_id.eq.${user.id}`),
  ]);

  const myReviews = (reviewsData ?? []) as Pick<
    Review,
    "id" | "cycle_id" | "status"
  >[];
  const { data: cycleRows } =
    myReviews.length > 0
      ? await admin
          .from("review_cycles")
          .select("id, name, status, self_due")
          .in(
            "id",
            myReviews.map((r) => r.cycle_id)
          )
      : { data: [] };
  const cyclesById = new Map<
    string,
    Pick<ReviewCycle, "id" | "name" | "status" | "self_due">
  >();
  for (const c of (cycleRows ?? []) as Pick<
    ReviewCycle,
    "id" | "name" | "status" | "self_due"
  >[]) {
    cyclesById.set(c.id, c);
  }

  type RawKudosRow = Omit<KudosWithUsers, "sender" | "recipient"> & {
    sender: Array<{ full_name: string; preferred_name: string | null; first_name: string | null; last_name: string | null; email: string }> | null;
  };
  const kudos = ((kudosRows ?? []) as unknown as RawKudosRow[]).map((k) => ({
    ...k,
    sender: Array.isArray(k.sender) && k.sender.length > 0 ? k.sender[0] : null,
  }));

  const reviewBlocks = myReviews.map((r) => {
    const c = cyclesById.get(r.cycle_id);
    return { review: r, cycle: c };
  });
  const openReviews = reviewBlocks.filter(
    (b) => b.cycle?.status === "open" && b.review.status !== "signed_off"
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SummaryCard
        icon={<ArrowRight size={14} />}
        title="Reviews"
        href="/performance/reviews"
      >
        {myReviews.length === 0 ? (
          <p className="text-sm text-gray-500">You&apos;re not in any cycle.</p>
        ) : openReviews.length > 0 ? (
          <p className="text-sm text-gray-700">
            <strong>{openReviews.length}</strong> open review
            {openReviews.length === 1 ? "" : "s"} need your attention
            {openReviews[0].cycle?.self_due &&
              ` · self due ${format(parseISO(openReviews[0].cycle.self_due), "MMM d")}`}
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            {myReviews.length} total · all up to date
          </p>
        )}
      </SummaryCard>

      <SummaryCard
        icon={<Users size={14} />}
        title="Peer Feedback"
        href="/performance/peer-requests"
      >
        <p className="text-sm text-gray-700">
          <strong>{pendingPeerCount ?? 0}</strong> pending request
          {(pendingPeerCount ?? 0) === 1 ? "" : "s"}
        </p>
      </SummaryCard>

      <SummaryCard
        icon={<Target size={14} />}
        title="KPIs"
        href="/performance/kpis"
      >
        <p className="text-sm text-gray-700">
          <strong>{kpiCount ?? 0}</strong> active
        </p>
      </SummaryCard>

      <SummaryCard
        icon={<Heart size={14} />}
        title="Kudos"
        href="/performance/kudos"
      >
        {kudos.length === 0 ? (
          <p className="text-sm text-gray-500">No kudos yet.</p>
        ) : (
          <p className="text-sm text-gray-700">
            Latest from{" "}
            <strong>{displayName(kudos[0].sender ?? null)}</strong>:{" "}
            <em className="text-gray-600">
              &ldquo;{kudos[0].message.slice(0, 60)}
              {kudos[0].message.length > 60 ? "…" : ""}&rdquo;
            </em>
          </p>
        )}
      </SummaryCard>

      <SummaryCard
        icon={<CalendarClock size={14} />}
        title="1-on-1s"
        href="/performance/one-on-ones"
      >
        <p className="text-sm text-gray-700">
          <strong>{oneOnOneCount ?? 0}</strong> on record
        </p>
      </SummaryCard>

      {openReviews.length === 0 && myReviews.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 lg:col-span-2">
          <Lock size={14} className="inline" /> All your reviews are signed off.
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:bg-gray-50"
    >
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {icon} {title}
      </h2>
      {children}
    </Link>
  );
}
