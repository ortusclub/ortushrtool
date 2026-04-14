import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { AttendanceTable } from "@/components/attendance/attendance-table";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const [{ data: logs }, { data: schedules }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("*")
      .eq("employee_id", user.id)
      .order("date", { ascending: false })
      .limit(30),
    supabase
      .from("schedules")
      .select("day_of_week, work_location, is_rest_day, effective_from, effective_until")
      .eq("employee_id", user.id)
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
        <p className="text-gray-600">Your attendance history from DeskTime</p>
      </div>
      <AttendanceTable
        initialLogs={logs ?? []}
        userId={user.id}
        schedules={schedules ?? []}
      />
    </div>
  );
}
