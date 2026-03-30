import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole, formatDate, formatTime } from "@/lib/utils";
import { FlagAcknowledge } from "@/components/attendance/flag-acknowledge";

export default async function FlagsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isAdmin = hasRole(user.role, "hr_admin");
  const isManager = hasRole(user.role, "manager");

  let query = supabase
    .from("attendance_flags")
    .select("*, employee:users!attendance_flags_employee_id_fkey(full_name, email)")
    .order("flag_date", { ascending: false });

  if (!isAdmin && !isManager) {
    query = query.eq("employee_id", user.id);
  }

  const { data: flags } = await query.limit(50);

  const flagTypeLabels: Record<string, string> = {
    late_arrival: "Late Arrival",
    early_departure: "Early Departure",
    absent: "Absent",
  };

  const flagTypeStyles: Record<string, string> = {
    late_arrival: "bg-yellow-100 text-yellow-700",
    early_departure: "bg-orange-100 text-orange-700",
    absent: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "All Flags" : isManager ? "Team Flags" : "My Flags"}
        </h1>
        <p className="text-gray-600">
          Attendance compliance flags
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {flags && flags.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {flags.map((flag) => (
              <div
                key={flag.id}
                className="flex items-start justify-between p-6"
              >
                <div className="space-y-1">
                  {(isAdmin || isManager) && flag.employee && (
                    <p className="font-medium text-gray-900">
                      {flag.employee.full_name || flag.employee.email}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${flagTypeStyles[flag.flag_type] ?? "bg-gray-100"}`}
                    >
                      {flagTypeLabels[flag.flag_type] ?? flag.flag_type}
                    </span>
                    <span className="text-sm text-gray-600">
                      {formatDate(flag.flag_date)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Scheduled:</span>{" "}
                    {formatTime(flag.scheduled_time)}
                    {flag.actual_time && (
                      <>
                        {" "}
                        &rarr; <span className="font-medium">Actual:</span>{" "}
                        {formatTime(flag.actual_time)}
                      </>
                    )}
                  </p>
                  {flag.deviation_minutes > 0 && (
                    <p className="text-sm text-gray-500">
                      {flag.deviation_minutes} minutes deviation
                    </p>
                  )}
                  {flag.notes && (
                    <p className="text-sm text-gray-500 italic">
                      Note: {flag.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {flag.acknowledged ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Acknowledged
                    </span>
                  ) : flag.employee_id === user.id ? (
                    <FlagAcknowledge flagId={flag.id} />
                  ) : (
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No flags found.
          </div>
        )}
      </div>
    </div>
  );
}
