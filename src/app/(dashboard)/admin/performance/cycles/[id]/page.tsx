import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CycleStatusControls } from "@/components/admin/cycle-status-controls";
import { displayName } from "@/lib/utils";
import type {
  ReviewCycle,
  ReviewFormTemplate,
  Review,
} from "@/types/database";

export default async function CycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("hr_admin");
  const { id } = await params;
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from("review_cycles")
    .select("*")
    .eq("id", id)
    .single();

  if (!cycle) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/performance"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Performance
        </Link>
        <p className="text-red-600">Cycle not found.</p>
      </div>
    );
  }
  const c = cycle as ReviewCycle;

  const [{ data: template }, { data: reviews }] = await Promise.all([
    c.template_id
      ? supabase
          .from("review_form_templates")
          .select("id, name, questions")
          .eq("id", c.template_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("reviews")
      .select(
        "id, employee_id, status, self_submitted_at, manager_submitted_at, signed_off_at, employee:users!reviews_employee_id_fkey(id, full_name, preferred_name, first_name, last_name, email, department)"
      )
      .eq("cycle_id", id),
  ]);

  const t = template as Pick<ReviewFormTemplate, "id" | "name" | "questions"> | null;
  type RawReview = Omit<Review, "self_responses" | "manager_responses"> & {
    employee:
      | Array<{
          id: string;
          full_name: string;
          preferred_name: string | null;
          first_name: string | null;
          last_name: string | null;
          email: string;
          department: string | null;
        }>
      | null;
  };
  const reviewList = (reviews ?? []) as unknown as RawReview[];

  const statusStyles: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-600",
    self_done: "bg-amber-100 text-amber-800",
    manager_done: "bg-blue-100 text-blue-800",
    signed_off: "bg-emerald-100 text-emerald-800",
  };
  const statusLabel: Record<string, string> = {
    not_started: "Not started",
    self_done: "Self done",
    manager_done: "Manager done",
    signed_off: "Signed off",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/performance"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Performance
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[26px] leading-tight text-gray-900">{c.name}</h1>
            <p className="text-gray-600">
              {format(parseISO(c.start_date), "MMM d")} –{" "}
              {format(parseISO(c.end_date), "MMM d, yyyy")}
              {t && ` · ${t.name}`}
            </p>
          </div>
          <CycleStatusControls cycleId={c.id} status={c.status} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <DueCard label="Self review" date={c.self_due} />
        <DueCard label="Manager review" date={c.manager_due} />
        <DueCard label="Peer review" date={c.peer_due} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-900">Participants</h2>
        </div>
        {reviewList.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No participants.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {reviewList.map((r) => {
              const emp =
                Array.isArray(r.employee) && r.employee.length > 0
                  ? r.employee[0]
                  : null;
              if (!emp) return null;
              return (
                <li key={r.id}>
                  <Link
                    href={`/team/${emp.id}/performance`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {displayName(emp)}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {emp.email}
                        {emp.department && ` · ${emp.department}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[r.status]}`}
                    >
                      {statusLabel[r.status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function DueCard({ label, date }: { label: string; date: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {label} due
      </p>
      <p className="mt-1 text-sm text-gray-900">
        {date ? format(parseISO(date), "MMM d, yyyy") : "—"}
      </p>
    </div>
  );
}
