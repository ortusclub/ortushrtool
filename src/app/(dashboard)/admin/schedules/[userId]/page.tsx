import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserScheduleEditor } from "@/components/admin/user-schedule-editor";
import { AdminAdjustmentForm } from "@/components/admin/admin-adjustment-form";
import { AdminLeaveForm } from "@/components/admin/admin-leave-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";

export default async function UserSchedulePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireRole("hr_admin");
  const { userId } = await params;
  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (!user) {
    return <div className="p-6 text-red-600">User not found.</div>;
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: schedules } = await supabase
    .from("schedules")
    .select("*")
    .eq("employee_id", userId)
    .lte("effective_from", today)
    .or(`effective_until.is.null,effective_until.gte.${today}`)
    .order("day_of_week", { ascending: true });

  // Get upcoming adjustments
  const { data: adjustments } = await supabase
    .from("schedule_adjustments")
    .select("*")
    .eq("employee_id", userId)
    .gte("requested_date", today)
    .order("requested_date", { ascending: true })
    .limit(20);

  // Get upcoming/current leave
  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("employee_id", userId)
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .limit(20);

  // Get manager name
  let managerName = null;
  if (user.manager_id) {
    const { data: manager } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", user.manager_id)
      .single();
    managerName = manager?.full_name || manager?.email || null;
  }

  const tz =
    user.timezone === "Asia/Manila"
      ? "PHT"
      : user.timezone === "Europe/Berlin"
        ? "CET"
        : user.timezone === "Asia/Dubai"
          ? "GST"
          : user.timezone;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Users
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {user.full_name || user.email}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span>{user.email}</span>
          <span className="text-gray-300">|</span>
          <span>Timezone: {tz}</span>
          {managerName && (
            <>
              <span className="text-gray-300">|</span>
              <span>Manager: {managerName}</span>
            </>
          )}
        </div>
      </div>

      {/* Default Schedule */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Default Weekly Schedule
        </h2>
        <UserScheduleEditor
          userId={userId}
          schedules={(schedules ?? []).map((s) => ({
            id: s.id,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_rest_day: s.is_rest_day,
            work_location: s.work_location,
            effective_from: s.effective_from,
          }))}
        />
      </div>

      {/* One-off Adjustment */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Add One-Off Adjustment
        </h2>
        <AdminAdjustmentForm userId={userId} />
      </div>

      {/* Existing Adjustments */}
      {adjustments && adjustments.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Adjustments
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="divide-y divide-gray-100">
              {adjustments.map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-center justify-between p-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(adj.requested_date)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatTime(adj.requested_start_time)} -{" "}
                      {formatTime(adj.requested_end_time)}
                    </p>
                    {adj.reason && (
                      <p className="text-xs text-gray-500">{adj.reason}</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
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
          </div>
        </div>
      )}

      {/* Add Leave */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Add Leave
        </h2>
        <AdminLeaveForm userId={userId} />
      </div>

      {/* Existing Leave */}
      {leaves && leaves.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Leave
          </h2>
          <div className="rounded-xl border border-purple-200 bg-white shadow-sm">
            <div className="divide-y divide-gray-100">
              {leaves.map((leave) => {
                const leaveLabels: Record<string, string> = {
                  annual: "Annual Leave",
                  sick: "Sick Leave",
                  personal: "Personal Leave",
                  unpaid: "Unpaid Leave",
                  other: "Other",
                };
                return (
                  <div
                    key={leave.id}
                    className="flex items-center justify-between p-4"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          {leaveLabels[leave.leave_type] ?? leave.leave_type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">
                        {formatDate(leave.start_date)} &mdash;{" "}
                        {formatDate(leave.end_date)}
                      </p>
                      {leave.reason && (
                        <p className="text-xs text-gray-500">{leave.reason}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                        leave.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : leave.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {leave.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
