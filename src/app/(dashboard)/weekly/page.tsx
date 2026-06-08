import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { WeeklyScheduleTable } from "@/components/admin/weekly-schedule-table";
import { CalendarSyncSection } from "@/components/calendar/calendar-sync-section";
import type { Schedule } from "@/types/database";

export default async function WeeklySchedulePage() {
  const currentUser = await requireRole("employee");
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Use admin client to bypass RLS — Team Calendar shows everyone to everyone,
  // matching the Team Directory pattern.
  const supabase = createAdminClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: users } = await supabase
    .from("users")
    .select("*")
    .eq("is_active", true)
    .order("full_name");

  // Paginate past PostgREST's 1000-row cap — see admin/schedules/page.tsx.
  // Without this, employees in the truncated tail show no schedule at all.
  const schedules = await fetchAllRows<Schedule>((from, to) =>
    supabase
      .from("schedules")
      .select("*")
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .order("id")
      .range(from, to)
  );

  const { data: holidays } = await supabase
    .from("holidays")
    .select("*");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Calendar</h1>
        <p className="text-gray-600">
          Team schedules, holidays, and leave at a glance
        </p>
      </div>
      <CalendarSyncSection
        initialToken={currentUser.calendar_token ?? null}
        appUrl={appUrl}
        userRole={currentUser.role}
        defaultCountry={currentUser.holiday_country}
      />
      <WeeklyScheduleTable
        users={users ?? []}
        schedules={schedules ?? []}
        holidays={holidays ?? []}
      />
    </div>
  );
}
