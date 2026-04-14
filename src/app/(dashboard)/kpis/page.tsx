import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";
import { getAllReports } from "@/lib/kpi/hierarchy";
import { KpiDashboard } from "@/components/kpi/kpi-dashboard";

const KPI_SELECT =
  "*, kpi_definition:kpi_definitions!kpi_assignments_kpi_definition_id_fkey(*), employee:users!kpi_assignments_employee_id_fkey(id, full_name, email)";

export default async function KpisPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isManager = hasRole(user.role, "manager");
  const isAdmin = hasRole(user.role, "hr_admin");

  // Always fetch own KPIs
  const { data: myAssignments } = await supabase
    .from("kpi_assignments")
    .select(KPI_SELECT)
    .eq("employee_id", user.id)
    .order("period_start", { ascending: false });

  // Hierarchy data
  let directReports: { id: string; full_name: string; email: string; manager_id: string | null }[] = [];
  let indirectReports: { id: string; full_name: string; email: string; manager_id: string | null }[] = [];
  let directReportAssignments: typeof myAssignments = [];
  let indirectReportAssignments: typeof myAssignments = [];
  let allEmployees: { id: string; full_name: string; email: string; manager_id: string | null }[] = [];
  let allAssignments: typeof myAssignments = [];
  let definitions: { id: string; name: string; description: string | null; unit_type: string; unit_label: string | null; created_by: string; is_active: boolean; created_at: string; updated_at: string }[] = [];

  if (isAdmin) {
    // HR/admin: fetch everything
    const adminClient = createAdminClient();

    const [usersResult, assignmentsResult, defsResult] = await Promise.all([
      adminClient
        .from("users")
        .select("id, full_name, email, manager_id")
        .eq("is_active", true)
        .order("full_name"),
      adminClient
        .from("kpi_assignments")
        .select(KPI_SELECT)
        .order("period_start", { ascending: false }),
      adminClient
        .from("kpi_definitions")
        .select("*")
        .eq("is_active", true)
        .order("name"),
    ]);

    allEmployees = usersResult.data ?? [];
    allAssignments = assignmentsResult.data ?? [];
    definitions = defsResult.data ?? [];

    // Also split into direct/indirect for tab views
    const hierarchy = await getAllReports(adminClient, user.id);
    directReports = hierarchy.directReports;
    indirectReports = hierarchy.indirectReports;

    const directIds = new Set(directReports.map((r) => r.id));
    const indirectIds = new Set(indirectReports.map((r) => r.id));

    directReportAssignments = (allAssignments ?? []).filter((a) =>
      directIds.has(a.employee_id)
    );
    indirectReportAssignments = (allAssignments ?? []).filter((a) =>
      indirectIds.has(a.employee_id)
    );
  } else if (isManager) {
    // Manager: fetch hierarchy and use admin client for indirect reports
    const adminClient = createAdminClient();
    const hierarchy = await getAllReports(adminClient, user.id);
    directReports = hierarchy.directReports;
    indirectReports = hierarchy.indirectReports;

    const [directResult, indirectResult, defsResult] = await Promise.all([
      directReports.length > 0
        ? supabase
            .from("kpi_assignments")
            .select(KPI_SELECT)
            .in(
              "employee_id",
              directReports.map((r) => r.id)
            )
            .order("period_start", { ascending: false })
        : Promise.resolve({ data: [] }),
      indirectReports.length > 0
        ? adminClient
            .from("kpi_assignments")
            .select(KPI_SELECT)
            .in(
              "employee_id",
              indirectReports.map((r) => r.id)
            )
            .order("period_start", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("kpi_definitions")
        .select("*")
        .eq("is_active", true)
        .order("name"),
    ]);

    directReportAssignments = directResult.data ?? [];
    indirectReportAssignments = indirectResult.data ?? [];
    definitions = defsResult.data ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">KPIs</h1>
        <p className="text-gray-600">
          Track and manage key performance indicators
        </p>
      </div>
      <KpiDashboard
        currentUser={user}
        myAssignments={(myAssignments ?? []) as never[]}
        directReports={directReports}
        directReportAssignments={(directReportAssignments ?? []) as never[]}
        indirectReports={indirectReports}
        indirectReportAssignments={
          (indirectReportAssignments ?? []) as never[]
        }
        allEmployees={allEmployees}
        allAssignments={(allAssignments ?? []) as never[]}
        definitions={definitions as never[]}
      />
    </div>
  );
}
