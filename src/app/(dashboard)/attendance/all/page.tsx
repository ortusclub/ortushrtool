import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/helpers";
import { hasRole } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubdepartmentMap } from "@/lib/subdepartment";
import { SyncDesktimeButton } from "@/components/admin/sync-desktime-button";
import { AllAttendanceTable } from "@/components/attendance/all-attendance-table";
import { BiometricUpload } from "@/components/admin/biometric-upload";
import { Fingerprint, ChevronDown } from "lucide-react";


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

export default async function AllAttendancePage() {
  const shiftCutoffHour = await getShiftCutoffHour();
  const user = await getCurrentUser();
  // hr_support watches company-wide attendance read-only: it never syncs
  // DeskTime or uploads biometric punches (both API routes reject it anyway).
  if (user.role !== "hr_support" && !hasRole(user.role, "hr_admin")) {
    redirect("/");
  }
  const isWatcher = user.role === "hr_support";
  // The role gate above is the access check; read the roster with the admin
  // client so hr_support (whose users RLS only reaches itself) sees everyone.
  const supabase = createAdminClient();
  const subdeptMap = await getSubdepartmentMap();

  const [{ data: rawUsers }, { data: allActive }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email, timezone, holiday_country, desktime_url, job_title, manager_id")
      .eq("is_active", true)
      .order("full_name"),
    // Managers may not have a DeskTime ID, so fetch the full active set just
    // for the manager lookup.
    supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name")
      .eq("is_active", true),
  ]);

  const managerById = new Map((allActive ?? []).map((m) => [m.id, m]));
  const users = (rawUsers ?? []).map((u) => ({
    ...u,
    manager: u.manager_id ? (managerById.get(u.manager_id) ?? null) : null,
    subdepartment: subdeptMap.get(u.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">All Attendance</h1>
        <p className="text-gray-600">
          Company-wide attendance from DeskTime
        </p>
      </div>

      {!isWatcher && <SyncDesktimeButton />}

      {!isWatcher && (
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
      )}

      <AllAttendanceTable shiftCutoffHour={shiftCutoffHour} users={users} />
    </div>
  );
}
