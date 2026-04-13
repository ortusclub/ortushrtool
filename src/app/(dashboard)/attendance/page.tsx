import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { AttendanceTable } from "@/components/attendance/attendance-table";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("employee_id", user.id)
    .order("date", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
        <p className="text-gray-600">Your attendance history from DeskTime</p>
      </div>
      <AttendanceTable initialLogs={logs ?? []} userId={user.id} />
    </div>
  );
}
