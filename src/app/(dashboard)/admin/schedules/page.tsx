import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { SchedulesTable } from "@/components/admin/schedules-table";
import { ScheduleCsvImport } from "@/components/admin/schedule-csv-import";
import { displayName } from "@/lib/utils";
import type { Schedule } from "@/types/database";

export default async function AdminSchedulesPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, preferred_name, first_name, last_name, email, timezone, manager_id, role")
    .eq("is_active", true)
    .order("full_name");

  // Paginate: the company-wide schedule set (~1 row per employee per weekday)
  // exceeds PostgREST's 1000-row cap, which would silently drop the tail and
  // make those employees' whole week render as "Rest".
  const allSchedules = await fetchAllRows<Schedule>((from, to) =>
    supabase
      .from("schedules")
      .select("*")
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .order("id")
      .range(from, to)
  );

  // Build manager name lookup (preferred-name display)
  const managerMap: Record<string, string> = {};
  for (const u of users ?? []) {
    managerMap[u.id] = displayName(u);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Schedules</h1>
        <p className="text-gray-600">
          Company-wide schedule overview — {users?.length ?? 0} employees
        </p>
      </div>
      <ScheduleCsvImport
        users={(users ?? []).map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }))}
        schedules={allSchedules ?? []}
      />
      <SchedulesTable
        users={users ?? []}
        schedules={allSchedules ?? []}
        managerMap={managerMap}
      />
    </div>
  );
}
