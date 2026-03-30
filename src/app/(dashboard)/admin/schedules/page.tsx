import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { DAYS_OF_WEEK } from "@/lib/constants";

export default async function AdminSchedulesPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  // Get all active users with their schedules
  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, email, timezone, manager_id")
    .eq("is_active", true)
    .order("full_name");

  const { data: allSchedules } = await supabase
    .from("schedules")
    .select("*")
    .lte("effective_from", today)
    .or(`effective_until.is.null,effective_until.gte.${today}`);

  // Build schedule lookup: userId -> dayOfWeek -> schedule
  const scheduleMap = new Map<string, Map<number, { start_time: string; end_time: string; is_rest_day: boolean; work_location: string }>>();
  for (const s of allSchedules ?? []) {
    if (!scheduleMap.has(s.employee_id)) {
      scheduleMap.set(s.employee_id, new Map());
    }
    scheduleMap.get(s.employee_id)!.set(s.day_of_week, s);
  }

  // Build manager name lookup
  const userMap = new Map<string, string>();
  for (const u of users ?? []) {
    userMap.set(u.id, u.full_name || u.email);
  }

  const dayHeaders = DAYS_OF_WEEK.slice(0, 5); // Mon-Fri only

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Schedules</h1>
        <p className="text-gray-600">
          Company-wide schedule overview — {users?.length ?? 0} employees
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="sticky left-0 bg-gray-50 px-4 py-3 font-medium text-gray-600 min-w-[160px]">Person</th>
              <th className="px-4 py-3 font-medium text-gray-600 min-w-[120px]">Manager</th>
              <th className="px-4 py-3 font-medium text-gray-600 min-w-[60px]">TZ</th>
              {dayHeaders.map((day) => (
                <th key={day} className="px-4 py-3 font-medium text-gray-600 text-center min-w-[150px]">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(users ?? []).map((user) => {
              const userSchedule = scheduleMap.get(user.id);
              const tz = user.timezone === "Asia/Manila" ? "PHT" : user.timezone === "Europe/Berlin" ? "CET" : user.timezone === "Asia/Dubai" ? "GST" : user.timezone;

              return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-3 font-medium text-gray-900">
                    <div>
                      {user.full_name || user.email.split("@")[0]}
                      <p className="text-xs text-gray-400 font-normal">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {user.manager_id ? userMap.get(user.manager_id) ?? "-" : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{tz}</td>
                  {[0, 1, 2, 3, 4].map((dayIdx) => {
                    const sched = userSchedule?.get(dayIdx);
                    if (!sched || sched.is_rest_day) {
                      return (
                        <td key={dayIdx} className="px-4 py-3 text-center text-gray-400 text-xs">
                          Rest
                        </td>
                      );
                    }
                    const isOffice = sched.work_location === "office";
                    return (
                      <td key={dayIdx} className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            isOffice
                              ? "bg-blue-50 text-blue-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {isOffice ? "Office" : "Online"}
                        </span>
                        <p className="mt-0.5 text-xs text-gray-600">
                          {sched.start_time.slice(0, 5)} - {sched.end_time.slice(0, 5)}
                        </p>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
