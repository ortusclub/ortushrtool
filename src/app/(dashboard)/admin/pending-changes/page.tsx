import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PendingChangesQueue } from "@/components/admin/pending-changes-queue";
import type { PendingChangeWithRequester } from "@/types/database";

type ScheduleDay = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
  work_location: string;
};

export default async function PendingChangesPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: changes } = await supabase
    .from("pending_changes")
    .select(
      "*, requester:users!pending_changes_requested_by_fkey(full_name, preferred_name, first_name, last_name, email), target:users!pending_changes_target_employee_id_fkey(full_name, preferred_name, first_name, last_name, email), decider:users!pending_changes_decided_by_fkey(full_name, preferred_name, first_name, last_name, email)"
    )
    .order("requested_at", { ascending: false });

  const all = (changes ?? []) as PendingChangeWithRequester[];

  // Current effective schedules for the targets of pending weekly-schedule
  // changes, so the reviewer can compare current vs requested side by side.
  const schedTargets = [
    ...new Set(
      all
        .filter((c) => c.change_type === "schedule_weekly_change" && c.status === "pending")
        .map((c) => c.target_employee_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const currentSchedules: Record<string, ScheduleDay[]> = {};
  if (schedTargets.length > 0) {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data: scheds } = await admin
      .from("schedules")
      .select("employee_id, day_of_week, start_time, end_time, is_rest_day, work_location")
      .in("employee_id", schedTargets)
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`);
    for (const s of scheds ?? []) {
      (currentSchedules[s.employee_id] ??= []).push({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_rest_day: s.is_rest_day,
        work_location: s.work_location,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pending Changes</h1>
        <p className="text-gray-600">
          Review changes submitted by HR support. Approving applies them to the
          database; rejecting discards them. Decisions are logged.
        </p>
      </div>
      <PendingChangesQueue initialChanges={all} currentSchedules={currentSchedules} />
    </div>
  );
}
