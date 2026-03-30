import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { UserScheduleEditor } from "@/components/admin/user-schedule-editor";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
          href="/admin/schedules"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to All Schedules
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
          {user.department && (
            <>
              <span className="text-gray-300">|</span>
              <span>Dept: {user.department}</span>
            </>
          )}
        </div>
      </div>

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
  );
}
