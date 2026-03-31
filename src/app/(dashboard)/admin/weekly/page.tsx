import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { WeeklyScheduleTable } from "@/components/admin/weekly-schedule-table";

export default async function WeeklySchedulePage() {
  const currentUser = await requireRole("hr_admin");
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: users } = await supabase
    .from("users")
    .select("*")
    .eq("is_active", true)
    .order("full_name");

  const { data: schedules } = await supabase
    .from("schedules")
    .select("*")
    .lte("effective_from", today)
    .or(`effective_until.is.null,effective_until.gte.${today}`);

  const { data: holidays } = await supabase
    .from("holidays")
    .select("*");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Overview</h1>
        <p className="text-gray-600">
          Team schedules, holidays, and leave for the current week
        </p>
      </div>
      <WeeklyScheduleTable
        users={users ?? []}
        schedules={schedules ?? []}
        holidays={holidays ?? []}
      />
    </div>
  );
}
