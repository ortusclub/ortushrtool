import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, formatDate, formatAdjustmentChange } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Flag, MapPin, CalendarCog } from "lucide-react";
import { redirect } from "next/navigation";
import { WeeklyScheduleEditor } from "@/components/profile/weekly-schedule-editor";
import { OneOffAdjustmentForm } from "@/components/profile/one-off-adjustment-form";

export default async function TeamMemberAttendanceTab({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { userId } = await params;
  const isOwnProfile = currentUser.id === userId;
  const isAdmin = hasRole(currentUser.role, "hr_admin");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("manager_id")
    .eq("id", userId)
    .single();
  const isDirectManager = user?.manager_id === currentUser.id;
  if (!(isAdmin || isOwnProfile || isDirectManager)) redirect(`/team/${userId}`);
  const canEditSchedule = isAdmin || isOwnProfile || isDirectManager;
  const submitMode: "direct" | "queue" = isAdmin ? "direct" : "queue";

  const today = new Date().toISOString().split("T")[0];
  const [{ data: schedules }, { data: adjustments }, { data: flagHistory }] =
    await Promise.all([
      supabase
        .from("schedules")
        .select("*")
        .eq("employee_id", userId)
        .lte("effective_from", today)
        .or(`effective_until.is.null,effective_until.gte.${today}`)
        .order("day_of_week", { ascending: true }),
      supabase
        .from("schedule_adjustments")
        .select("*")
        .eq("employee_id", userId)
        .gte("requested_date", today)
        .order("requested_date", { ascending: true })
        .limit(20),
      supabase
        .from("attendance_flags")
        .select(
          "id, flag_type, flag_date, deviation_minutes, scheduled_time, actual_time, acknowledged, notes, employee_notes"
        )
        .eq("employee_id", userId)
        .order("flag_date", { ascending: false })
        .limit(50),
    ]);

  return (
    <div className="space-y-6">
      {/* Default Weekly Schedule */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <MapPin size={14} />
          Default Weekly Schedule
        </h2>
        <WeeklyScheduleEditor
          employeeId={userId}
          schedules={(schedules ?? []).map((s) => ({
            id: s.id,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_rest_day: s.is_rest_day,
            work_location: s.work_location,
          }))}
          canEdit={canEditSchedule}
          submitMode={submitMode}
        />
      </div>

      {/* One-off adjustment */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <CalendarCog size={14} />
          One-Off Adjustments
        </h2>
        <OneOffAdjustmentForm employeeId={userId} submitMode={submitMode} />
        {adjustments && adjustments.length > 0 && (
          <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
            {adjustments.map((adj) => (
              <div
                key={adj.id}
                className="flex items-center justify-between py-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(adj.requested_date)}
                  </p>
                  <p className="text-xs text-gray-600">
                    {formatAdjustmentChange(adj)}
                  </p>
                  {adj.reason && (
                    <p className="text-xs italic text-gray-500">{adj.reason}</p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    adj.status === "approved"
                      ? "bg-green-100 text-green-700"
                      : adj.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {adj.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attendance Flag History */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Flag size={14} />
          Attendance Flag History
        </h2>
        {(flagHistory ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">No flags on record.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(flagHistory ?? []).map((f) => (
              <div
                key={f.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        f.flag_type === "late_arrival"
                          ? "bg-yellow-100 text-yellow-700"
                          : f.flag_type === "early_departure"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {f.flag_type === "late_arrival"
                        ? "Late Arrival"
                        : f.flag_type === "early_departure"
                          ? "Early Departure"
                          : "Absent"}
                    </span>
                    <span className="text-sm text-gray-600">
                      {format(parseISO(f.flag_date), "MMM d, yyyy")}
                    </span>
                    {f.deviation_minutes > 0 && (
                      <span className="text-xs text-gray-400">
                        {f.deviation_minutes} min
                      </span>
                    )}
                  </div>
                  {f.employee_notes && (
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">
                        Employee note:
                      </span>{" "}
                      <span className="italic">{f.employee_notes}</span>
                    </p>
                  )}
                  {f.notes && (
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">
                        Manager note:
                      </span>{" "}
                      <span className="italic">{f.notes}</span>
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.acknowledged
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {f.acknowledged ? "Acknowledged" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
