import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/utils";
import { FlagsTable } from "@/components/attendance/flags-table";

export default async function FlagsPage() {
  const user = await requireRole("manager");
  const supabase = await createClient();
  const isAdmin = hasRole(user.role, "hr_admin");

  // Get the employees this user can see
  let employees: { id: string; full_name: string; email: string }[] = [];

  if (isAdmin) {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name");
    employees = data ?? [];
  } else {
    // Manager: direct reports only
    const { data } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("manager_id", user.id)
      .eq("is_active", true)
      .order("full_name");
    employees = data ?? [];
  }

  const employeeIds = employees.map((e) => e.id);

  // Initial flags
  const { data: flags } = employeeIds.length
    ? await supabase
        .from("attendance_flags")
        .select("*, employee:users!attendance_flags_employee_id_fkey(full_name, email)")
        .in("employee_id", employeeIds)
        .order("flag_date", { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "All Flags" : "Team Flags"}
        </h1>
        <p className="text-gray-600">Attendance compliance flags</p>
      </div>
      <FlagsTable
        initialFlags={flags ?? []}
        employees={employees}
        currentUserId={user.id}
      />
    </div>
  );
}
