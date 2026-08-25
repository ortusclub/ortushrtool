import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { AttendanceTable } from "@/components/attendance/attendance-table";


/** Shift cutoff shared with desktime-sync: punches before this hour belong to
 *  the previous day's shift. */
async function getShiftCutoffHour(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "shift_cutoff_hour")
    .maybeSingle();
  const n = parseInt(data?.value ?? "5", 10);
  return Number.isFinite(n) ? n : 5;
}

export default async function AttendancePage() {
  const shiftCutoffHour = await getShiftCutoffHour();
  const user = await getCurrentUser();
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  // Biometric punches are stored UTC but represent Asia/Manila local time.
  // Use a 60-day window to cover the initial 30-log set comfortably; the
  // client re-queries when the user changes the date filter.
  const punchFromDate = new Date();
  punchFromDate.setDate(punchFromDate.getDate() - 60);
  const punchFrom = `${punchFromDate.toISOString().split("T")[0]}T00:00:00+08:00`;

  const [{ data: logs }, { data: schedules }, { data: punches }] = await Promise.all([
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
    supabase
      .from("biometric_punches")
      .select("punch_time")
      .eq("employee_id", user.id)
      .gte("punch_time", punchFrom),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
        <p className="text-gray-600">Your attendance history from DeskTime</p>
      </div>
      <AttendanceTable shiftCutoffHour={shiftCutoffHour}
        initialLogs={logs ?? []}
        userId={user.id}
        schedules={schedules ?? []}
        initialPunches={punches ?? []}
      />
    </div>
  );
}
