import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { SyncDesktimeButton } from "@/components/admin/sync-desktime-button";
import { AllAttendanceTable } from "@/components/attendance/all-attendance-table";

export default async function AllAttendancePage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, preferred_name, first_name, email, timezone, holiday_country, desktime_url")
    .eq("is_active", true)
    .not("desktime_employee_id", "is", null)
    .order("full_name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Attendance</h1>
        <p className="text-gray-600">
          Company-wide attendance from DeskTime
        </p>
      </div>

      <SyncDesktimeButton />

      <AllAttendanceTable users={users ?? []} />
    </div>
  );
}
