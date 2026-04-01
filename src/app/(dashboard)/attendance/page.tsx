import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

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

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {logs && logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Scheduled</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Clock In</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Clock Out</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Late (min)</th>
                  <th className="px-6 py-3 font-medium text-gray-600">Early Out (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      {log.scheduled_start} - {log.scheduled_end}
                    </td>
                    <td className="px-6 py-4">
                      {log.clock_in
                        ? new Date(log.clock_in).toLocaleTimeString("en-PH", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Manila",
                          })
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      {log.clock_out
                        ? new Date(log.clock_out).toLocaleTimeString("en-PH", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Manila",
                          })
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-6 py-4">{log.late_minutes ?? "-"}</td>
                    <td className="px-6 py-4">
                      {log.early_departure_minutes ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No attendance records found.
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
    on_leave: "bg-blue-100 text-blue-700",
    holiday: "bg-purple-100 text-purple-700",
    working: "bg-green-50 text-green-600",
  };

  const labels: Record<string, string> = {
    on_time: "On Time",
    late_arrival: "Late",
    early_departure: "Early Out",
    late_and_early: "Late & Early",
    absent: "Absent",
    rest_day: "Rest Day",
    on_leave: "On Leave",
    holiday: "Holiday",
    working: "Working",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status] ?? "bg-gray-100"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
