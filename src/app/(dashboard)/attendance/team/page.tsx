import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { getSubdepartmentMap } from "@/lib/subdepartment";
import { AllAttendanceTable } from "@/components/attendance/all-attendance-table";


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

export default async function TeamAttendancePage() {
  const shiftCutoffHour = await getShiftCutoffHour();
  const user = await requireRole("manager");
  const supabase = await createClient();
  const subdeptMap = await getSubdepartmentMap();

  const { data: rawReports } = await supabase
    .from("users")
    .select("id, full_name, preferred_name, first_name, last_name, email, timezone, holiday_country, desktime_url, job_title, manager_id")
    .eq("manager_id", user.id)
    .eq("is_active", true)
    .order("full_name");

  // All reports share this manager (the viewer); the Manager column is
  // hidden on this view anyway, so don't bother fetching a lookup.
  const reports = (rawReports ?? []).map((u) => ({
    ...u,
    manager: null,
    subdepartment: subdeptMap.get(u.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Attendance</h1>
        <p className="text-gray-600">
          Daily attendance for your direct reports ({reports?.length ?? 0}{" "}
          members)
        </p>
      </div>
      <AllAttendanceTable shiftCutoffHour={shiftCutoffHour} users={reports} employeePicker="dropdown" />
    </div>
  );
}
