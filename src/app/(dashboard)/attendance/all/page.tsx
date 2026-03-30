import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { SyncDesktimeButton } from "@/components/admin/sync-desktime-button";

export default async function AllAttendancePage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select(
      "*, employee:users!attendance_logs_employee_id_fkey(full_name, email)"
    )
    .order("date", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Attendance</h1>
        <p className="text-gray-600">
          Company-wide attendance from DeskTime
        </p>
      </div>

      <SyncDesktimeButton />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {logs && logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Scheduled</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Clock In</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Clock Out</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Late</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Early Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {log.employee?.full_name || log.employee?.email || "-"}
                    </td>
                    <td className="px-4 py-3">{formatDate(log.date)}</td>
                    <td className="px-4 py-3 text-xs">
                      {log.scheduled_start?.slice(0, 5)} - {log.scheduled_end?.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3">
                      {log.clock_in
                        ? new Date(log.clock_in).toLocaleTimeString("en-PH", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Manila",
                          })
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {log.clock_out
                        ? new Date(log.clock_out).toLocaleTimeString("en-PH", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Manila",
                          })
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-4 py-3 text-yellow-600">
                      {log.late_minutes ? `${log.late_minutes}m` : "-"}
                    </td>
                    <td className="px-4 py-3 text-orange-600">
                      {log.early_departure_minutes
                        ? `${log.early_departure_minutes}m`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No attendance records yet. Use the Sync button above to pull data from DeskTime.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    on_time: "bg-green-100 text-green-700",
    late_arrival: "bg-yellow-100 text-yellow-700",
    early_departure: "bg-orange-100 text-orange-700",
    late_and_early: "bg-red-100 text-red-700",
    absent: "bg-red-100 text-red-700",
    rest_day: "bg-gray-100 text-gray-600",
  };

  const labels: Record<string, string> = {
    on_time: "On Time",
    late_arrival: "Late",
    early_departure: "Early Out",
    late_and_early: "Late & Early",
    absent: "Absent",
    rest_day: "Rest Day",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status] ?? "bg-gray-100"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
