import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { SyncDesktimeButton } from "@/components/admin/sync-desktime-button";
import { AllAttendanceTable } from "@/components/attendance/all-attendance-table";
import { BiometricUpload } from "@/components/admin/biometric-upload";
import { Fingerprint, ChevronDown } from "lucide-react";

export default async function AllAttendancePage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: rawUsers } = await supabase
    .from("users")
    .select("id, full_name, preferred_name, first_name, last_name, email, timezone, holiday_country, desktime_url, job_title, manager_id, manager:users!users_manager_id_fkey(id, full_name, preferred_name, first_name, last_name)")
    .eq("is_active", true)
    .not("desktime_employee_id", "is", null)
    .order("full_name");

  // Supabase's type inference treats embedded relations as arrays even when
  // the FK is to-one; flatten to a single manager object (or null).
  const users = (rawUsers ?? []).map((u) => ({
    ...u,
    manager: Array.isArray(u.manager) ? (u.manager[0] ?? null) : u.manager,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Attendance</h1>
        <p className="text-gray-600">
          Company-wide attendance from DeskTime
        </p>
      </div>

      <SyncDesktimeButton />

      <details className="group rounded-xl border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50">
          <span className="flex items-center gap-2">
            <Fingerprint size={16} className="text-indigo-600" />
            Upload biometric data
            <span className="text-xs font-normal text-gray-500">
              (overrides Actual Location for the matching dates — DeskTime unaffected)
            </span>
          </span>
          <ChevronDown
            size={16}
            className="text-gray-500 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-gray-200 p-4">
          <BiometricUpload />
        </div>
      </details>

      <AllAttendanceTable users={users} />
    </div>
  );
}
