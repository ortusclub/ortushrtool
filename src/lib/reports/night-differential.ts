import type { SupabaseClient } from "@supabase/supabase-js";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { nightDifferentialHours } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type NightDiffScheduleRow = {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  timezone: string;
  nd_days: number;
  nd_hours_week: number;
  nd_schedule: string;
};

const hm = (t?: string | null) => (t || "").slice(0, 5);

/**
 * Payroll-facing list of every ACTIVE employee whose currently-effective
 * assigned weekly schedule includes any shift overlapping the night-
 * differential window (22:00–06:00). One row per employee, with the total
 * scheduled ND hours per week and a per-day breakdown. Employees with no
 * scheduled ND hours are omitted — the report IS the flag.
 *
 * Reads the company-wide `schedules` table, so it paginates past the
 * 1000-row PostgREST cap.
 */
export async function computeNightDifferentialSchedules(
  admin: SupabaseClient
): Promise<NightDiffScheduleRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: users } = await admin
    .from("users")
    .select("id, full_name, email, department, timezone")
    .eq("is_active", true);
  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  // Currently-effective, non-rest schedule rows, paginated.
  const PAGE = 1000;
  const schedules: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("schedules")
      .select("employee_id, day_of_week, start_time, end_time")
      .eq("is_rest_day", false)
      .lte("effective_from", today)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`schedules: ${error.message}`);
    schedules.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  type Acc = { days: { dow: number; label: string }[]; total: number };
  const byEmp = new Map<string, Acc>();
  for (const s of schedules) {
    const nd = nightDifferentialHours(s.start_time, s.end_time);
    if (nd <= 0) continue;
    if (!userMap.has(s.employee_id)) continue; // skip inactive/unknown
    const acc = byEmp.get(s.employee_id) ?? { days: [], total: 0 };
    const dayName = (DAYS_OF_WEEK[s.day_of_week] ?? `Day ${s.day_of_week}`).slice(0, 3);
    acc.days.push({
      dow: s.day_of_week,
      label: `${dayName} ${hm(s.start_time)}–${hm(s.end_time)} (${nd}h)`,
    });
    acc.total += nd;
    byEmp.set(s.employee_id, acc);
  }

  const rows: NightDiffScheduleRow[] = [];
  for (const [empId, acc] of byEmp) {
    const u: any = userMap.get(empId);
    acc.days.sort((a, b) => a.dow - b.dow);
    rows.push({
      employee_id: empId,
      employee_name: u.full_name ?? u.email ?? empId,
      employee_email: u.email ?? "",
      department: u.department ?? "",
      timezone: u.timezone || "Asia/Manila",
      nd_days: acc.days.length,
      nd_hours_week: Math.round(acc.total * 100) / 100,
      nd_schedule: acc.days.map((d) => d.label).join("; "),
    });
  }
  rows.sort(
    (a, b) =>
      b.nd_hours_week - a.nd_hours_week ||
      a.employee_name.localeCompare(b.employee_name)
  );
  return rows;
}
