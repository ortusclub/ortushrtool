import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuickExports } from "@/components/reports/quick-exports";
import { ReportBuilder } from "@/components/reports/report-builder";
import type { FilterValues } from "@/lib/reports/sources";
import { displayName } from "@/lib/utils";

export default async function ReportsPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("report_templates")
    .select(
      "id, name, source, columns, filters, created_at, creator:users!report_templates_created_by_fkey(full_name, preferred_name, first_name, last_name, email)"
    )
    .order("created_at", { ascending: false });

  // Department list for the report builder's Department filter. Pull the full
  // set (all active users, admin-side) so no team is missing from the dropdown.
  const admin = createAdminClient();
  const { data: deptRows } = await admin
    .from("users")
    .select("department")
    .eq("is_active", true)
    .not("department", "is", null);
  const departments = Array.from(
    new Set(
      (deptRows ?? [])
        .map((r) => (r.department as string | null)?.trim())
        .filter((d): d is string => !!d)
    )
  ).sort((a, b) => a.localeCompare(b));

  type CreatorRef = {
    full_name?: string | null;
    preferred_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  };
  const normalised = (templates ?? []).map((t) => {
    const creator = (t as { creator?: unknown }).creator as
      | CreatorRef
      | CreatorRef[]
      | null
      | undefined;
    const creatorRef = Array.isArray(creator) ? creator[0] : creator;
    const createdByName = creatorRef ? displayName(creatorRef) : undefined;
    return {
      id: t.id,
      name: t.name,
      source: t.source,
      columns: (t.columns ?? []) as string[],
      filters: (t.filters ?? {}) as FilterValues,
      created_at: t.created_at,
      created_by_name: createdByName ?? undefined,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600">
          Quick links to pages with built-in filter + export, plus a custom CSV
          builder for everything else (leave / overtime / holiday-work /
          schedule adjustment requests, time-off balances, etc.). Templates are
          shared across HR.
        </p>
      </div>
      <QuickExports />
      <ReportBuilder initialTemplates={normalised} departments={departments} />
    </div>
  );
}
