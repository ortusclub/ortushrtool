import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import type {
  ReviewCycle,
  ReviewFormTemplate,
} from "@/types/database";

export default async function AdminPerformancePage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const [{ data: cycles }, { data: templates }, { data: reviewCounts }] =
    await Promise.all([
      supabase
        .from("review_cycles")
        .select("*")
        .order("start_date", { ascending: false }),
      supabase.from("review_form_templates").select("id, name"),
      supabase.from("reviews").select("cycle_id, status"),
    ]);

  const cyclesList = (cycles ?? []) as ReviewCycle[];
  const templatesList = (templates ?? []) as Pick<
    ReviewFormTemplate,
    "id" | "name"
  >[];

  const countsByCycle = new Map<
    string,
    { total: number; self: number; signed: number }
  >();
  for (const r of reviewCounts ?? []) {
    const c =
      countsByCycle.get(r.cycle_id) ?? { total: 0, self: 0, signed: 0 };
    c.total++;
    if (r.status === "self_done" || r.status === "manager_done" || r.status === "signed_off")
      c.self++;
    if (r.status === "signed_off") c.signed++;
    countsByCycle.set(r.cycle_id, c);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight text-gray-900">Performance</h1>
          <p className="text-gray-600">
            Manage review cycles, form templates, and track completion.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/performance/templates"
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileText size={14} /> Form templates
          </Link>
          <Link
            href="/admin/performance/cycles/new"
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={14} /> New cycle
          </Link>
        </div>
      </div>

      {cyclesList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No review cycles yet. Start by creating a{" "}
          <Link
            href="/admin/performance/templates"
            className="text-blue-600 hover:underline"
          >
            form template
          </Link>{" "}
          and then a cycle.
        </div>
      ) : (
        <div className="space-y-2">
          {cyclesList.map((c) => {
            const t = templatesList.find((x) => x.id === c.template_id);
            const counts = countsByCycle.get(c.id) ?? {
              total: 0,
              self: 0,
              signed: 0,
            };
            const statusStyles: Record<string, string> = {
              draft: "bg-gray-100 text-gray-600",
              open: "bg-amber-100 text-amber-800",
              closed: "bg-emerald-100 text-emerald-800",
            };
            return (
              <Link
                key={c.id}
                href={`/admin/performance/cycles/${c.id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {c.name}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t?.name ?? "(template missing)"} ·{" "}
                    {format(parseISO(c.start_date), "MMM d")} –{" "}
                    {format(parseISO(c.end_date), "MMM d, yyyy")}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-gray-500">
                  {counts.signed}/{counts.total} signed off
                  {counts.total > 0 && (
                    <span className="ml-2 text-gray-400">
                      ({counts.self}/{counts.total} self-done)
                    </span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
