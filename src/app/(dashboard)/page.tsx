import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { Calendar, Clock, Flag, ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { hasRole } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Fetch counts for dashboard cards
  const today = new Date().toISOString().split("T")[0];

  const [pendingAdjustments, activeFlags, recentAttendance] = await Promise.all([
    // Pending adjustments (own for employee, team for manager/hr)
    hasRole(user.role, "manager")
      ? supabase
          .from("schedule_adjustments")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : supabase
          .from("schedule_adjustments")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", user.id)
          .eq("status", "pending"),

    // Unacknowledged flags
    supabase
      .from("attendance_flags")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", user.id)
      .eq("acknowledged", false),

    // Recent attendance (last 7 days)
    supabase
      .from("attendance_logs")
      .select("*")
      .eq("employee_id", user.id)
      .order("date", { ascending: false })
      .limit(5),
  ]);

  const cards = [
    {
      title: hasRole(user.role, "manager")
        ? "Pending Approvals"
        : "My Pending Requests",
      count: pendingAdjustments.count ?? 0,
      icon: <ArrowRightLeft className="text-blue-600" size={24} />,
      href: "/adjustments",
      color: "bg-blue-50",
    },
    {
      title: "Unacknowledged Flags",
      count: activeFlags.count ?? 0,
      icon: <Flag className="text-red-600" size={24} />,
      href: "/flags",
      color: "bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {user.full_name || user.email.split("@")[0]}
        </h1>
        <p className="text-gray-600">
          Here&apos;s your schedule and attendance overview.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{card.title}</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {card.count}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${card.color}`}>{card.icon}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent attendance */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Attendance
          </h2>
        </div>
        <div className="p-6">
          {recentAttendance.data && recentAttendance.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Scheduled</th>
                    <th className="pb-3 font-medium">Clock In</th>
                    <th className="pb-3 font-medium">Clock Out</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentAttendance.data.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3">{log.date}</td>
                      <td className="py-3">
                        {log.scheduled_start} - {log.scheduled_end}
                      </td>
                      <td className="py-3">
                        {log.clock_in
                          ? new Date(log.clock_in).toLocaleTimeString("en-PH", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Manila",
                            })
                          : "-"}
                      </td>
                      <td className="py-3">
                        {log.clock_out
                          ? new Date(log.clock_out).toLocaleTimeString("en-PH", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Manila",
                            })
                          : "-"}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={log.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500">
              No attendance records yet.
            </p>
          )}
        </div>
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
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
