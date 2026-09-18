import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { KpiFilters } from "@/components/performance/kpi-filters";

type SearchParams = Promise<{ year?: string; quarter?: string }>;

function quarterRange(year: number, quarter: string): [string, string] | null {
  const y = year;
  switch (quarter) {
    case "Q1":
      return [`${y}-01-01`, `${y}-03-31`];
    case "Q2":
      return [`${y}-04-01`, `${y}-06-30`];
    case "Q3":
      return [`${y}-07-01`, `${y}-09-30`];
    case "Q4":
      return [`${y}-10-01`, `${y}-12-31`];
    default:
      return null;
  }
}

export default async function PerformanceKpisPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  const admin = createAdminClient();
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = params.year ? parseInt(params.year, 10) : currentYear;
  const quarter = params.quarter ?? "all";

  let query = admin
    .from("kpi_assignments")
    .select(
      "id, current_value, target_value, status, period_start, period_end, definition:kpi_definitions(name, unit_type)"
    )
    .eq("employee_id", user.id)
    .order("period_end", { ascending: true });

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  query = query.gte("period_end", yearStart).lte("period_start", yearEnd);

  if (quarter !== "all") {
    const range = quarterRange(year, quarter);
    if (range) {
      query = query.gte("period_end", range[0]).lte("period_start", range[1]);
    }
  }

  const { data } = await query;
  type KpiRow = {
    id: string;
    current_value: number;
    target_value: number;
    status: string;
    period_start: string;
    period_end: string;
    definition: Array<{ name: string; unit_type: string }> | null;
  };
  const kpis = ((data ?? []) as unknown as KpiRow[]).map((k) => ({
    ...k,
    definition:
      Array.isArray(k.definition) && k.definition.length > 0
        ? k.definition[0]
        : null,
  }));
  const active = kpis.filter((k) => k.status === "active");
  const completed = kpis.filter((k) => k.status !== "active");

  const { data: allYearsRows } = await admin
    .from("kpi_assignments")
    .select("period_start, period_end")
    .eq("employee_id", user.id);
  const years = new Set<number>([currentYear]);
  for (const r of allYearsRows ?? []) {
    if (r.period_start) years.add(parseInt(r.period_start.slice(0, 4), 10));
    if (r.period_end) years.add(parseInt(r.period_end.slice(0, 4), 10));
  }
  const yearOptions = Array.from(years).sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Full management lives in{" "}
          <Link href="/kpis" className="text-blue-600 hover:underline">
            /kpis
          </Link>
          . This page surfaces your own assignments.
        </p>
        <KpiFilters year={year} quarter={quarter} yearOptions={yearOptions} />
      </div>

      <section>
        <h2 className="mb-2 font-display text-sm uppercase tracking-wide text-gray-500">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            No active KPIs for this period.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((k) => (
              <KpiCard key={k.id} kpi={k} />
            ))}
          </div>
        )}
      </section>
      {completed.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm uppercase tracking-wide text-gray-500">
            Completed / archived ({completed.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {completed.map((k) => (
              <KpiCard key={k.id} kpi={k} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({
  kpi,
}: {
  kpi: {
    current_value: number;
    target_value: number;
    period_start: string;
    period_end: string;
    definition: { name: string; unit_type: string } | null;
  };
}) {
  const pct =
    kpi.target_value > 0
      ? Math.min(100, (kpi.current_value / kpi.target_value) * 100)
      : 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-900">
        {kpi.definition?.name ?? "—"}
      </p>
      <p className="text-[11px] text-gray-400">
        {kpi.period_start} → {kpi.period_end}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {kpi.current_value}
        </span>
        <span className="text-xs text-gray-500">/ {kpi.target_value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
