import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { TeamAttendanceTable } from "@/components/attendance/team-attendance-table";

export default async function TeamAttendancePage() {
  const user = await requireRole("manager");
  const supabase = await createClient();

  // Get direct reports
  const { data: reports } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("manager_id", user.id)
    .eq("is_active", true)
    .order("full_name");

  const reportIds = (reports ?? []).map((r) => r.id);

  // Get recent attendance for team
  const { data: logs } = reportIds.length
    ? await supabase
        .from("attendance_logs")
        .select("*, employee:users!attendance_logs_employee_id_fkey(full_name, email)")
        .in("employee_id", reportIds)
        .order("date", { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Attendance</h1>
        <p className="text-gray-600">
          Attendance records for your direct reports ({reports?.length ?? 0}{" "}
          members)
        </p>
      </div>
      <TeamAttendanceTable
        initialLogs={logs ?? []}
        teamMembers={reports ?? []}
      />
    </div>
  );
}
