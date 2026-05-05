import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { AllAttendanceTable } from "@/components/attendance/all-attendance-table";

export default async function TeamAttendancePage() {
  const user = await requireRole("manager");
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from("users")
    .select("id, full_name, preferred_name, first_name, last_name, email, timezone, holiday_country, desktime_url")
    .eq("manager_id", user.id)
    .eq("is_active", true)
    .not("desktime_employee_id", "is", null)
    .order("full_name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Attendance</h1>
        <p className="text-gray-600">
          Daily attendance for your direct reports ({reports?.length ?? 0}{" "}
          members)
        </p>
      </div>
      <AllAttendanceTable users={reports ?? []} employeePicker="dropdown" />
    </div>
  );
}
