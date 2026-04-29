import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/utils";
import { FlagsTable } from "@/components/attendance/flags-table";

export default async function FlagsPage() {
  const user = await requireRole("employee");
  const supabase = await createClient();
  const isAdmin = hasRole(user.role, "hr_admin");
  const isManager = hasRole(user.role, "manager");

  // Build the visible employee set for filter dropdown + initial query
  let employees: { id: string; full_name: string; email: string }[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name");
    employees = data ?? [];
  } else if (isManager) {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, email")
      .or(`manager_id.eq.${user.id},id.eq.${user.id}`)
      .eq("is_active", true)
      .order("full_name");
    employees = data ?? [];
  } else {
    employees = [
      { id: user.id, full_name: user.full_name ?? "", email: user.email },
    ];
  }

  const employeeIds = employees.map((e) => e.id);

  const { data: flags } = employeeIds.length
    ? await supabase
        .from("attendance_flags")
        .select(
          "*, employee:users!attendance_flags_employee_id_fkey(full_name, email)"
        )
        .in("employee_id", employeeIds)
        .order("flag_date", { ascending: false })
        .limit(50)
    : { data: [] };

  const heading = isAdmin
    ? "All Flags"
    : isManager
      ? "Team Flags"
      : "My Flags";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
        <p className="text-gray-600">
          {isManager
            ? "Attendance compliance flags. Acknowledge after reviewing the employee's note."
            : "Your attendance compliance flags. Add a note explaining the situation; your manager will review and acknowledge."}
        </p>
      </div>
      <FlagsTable
        initialFlags={flags ?? []}
        employees={employees}
        currentUserId={user.id}
        canAcknowledge={isManager}
      />
    </div>
  );
}
