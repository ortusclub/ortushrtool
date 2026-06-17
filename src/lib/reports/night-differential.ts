import type { SupabaseClient } from "@supabase/supabase-js";
import { nightDifferentialHours } from "@/lib/utils";
import type { FilterValues } from "@/lib/reports/sources";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type NightDiffPeriodRow = {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  period: string;
  nd_days: number;
  nd_hours: number;
  nd_detail: string;
};

const hm = (t?: string | null) => (t || "").slice(0, 5);
const round = (n: number) => Math.round(n * 100) / 100;

// Statuses that represent the employee actually working that day, so a
// night-touching scheduled shift earns ND. Excludes rest_day, on_leave,
// holiday, absent, not_started, no_schedule — none of which are worked nights.
const WORKED_STATUSES = [
  "on_time",
  "working",
  "late_arrival",
  "early_departure",
  "late_and_early",
  "inconclusive",
];

/**
 * Payroll-facing night-differential report for a PAY PERIOD.
 *
 * Sourced from `attendance_logs`, which snapshots each day's effective
 * `scheduled_start`/`scheduled_end` (the DeskTime sync resolves approved
 * one-off adjustments first, then the recurring schedule). Because each day
 * is frozen, this survives mid-period schedule changes — unlike the live
 * `schedules` table, which only ever holds the current schedule and keeps no
 * history.
 *
 * One row per employee who has any scheduled ND (22:00–06:00) within the
 * period, with total ND hours, distinct ND days, and a per-shift breakdown.
 * Defaults to the current calendar month-to-date when no range is given.
 */
export async function computeNightDifferentialSchedules(
  admin: SupabaseClient,
  filters: FilterValues = {}
): Promise<NightDiffPeriodRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const dr =
    filters.date_range && typeof filters.date_range === "object"
      ? filters.date_range
      : {};
  const from = dr.from || `${today.slice(0, 7)}-01`;
  const to = dr.to || today;

  // Per-date scheduled times across the period. attendance_logs is one row per
  // (employee, date); paginate past the 1000-row cap.
  const PAGE = 1000;
  const logs: any[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await admin
      .from("attendance_logs")
      .select("employee_id, date, scheduled_start, scheduled_end")
      .gte("date", from)
      .lte("date", to)
      .not("scheduled_start", "is", null)
      .in("status", WORKED_STATUSES)
      .range(off, off + PAGE - 1);
    if (error) throw new Error(`attendance_logs: ${error.message}`);
    logs.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  type Acc = {
    dates: Set<string>;
    total: number;
    byShift: Map<string, { days: number; hours: number }>;
  };
  const byEmp = new Map<string, Acc>();
  for (const l of logs) {
    const nd = nightDifferentialHours(l.scheduled_start, l.scheduled_end);
    if (nd <= 0) continue;
    const acc =
      byEmp.get(l.employee_id) ?? { dates: new Set<string>(), total: 0, byShift: new Map() };
    acc.dates.add(l.date);
    acc.total += nd;
    const key = `${hm(l.scheduled_start)}–${hm(l.scheduled_end)}`;
    const sh = acc.byShift.get(key) ?? { days: 0, hours: 0 };
    sh.days += 1;
    sh.hours += nd;
    acc.byShift.set(key, sh);
    byEmp.set(l.employee_id, acc);
  }

  // Names/departments — include departed employees too (they still need paying
  // for nights worked in the period), so look up by id rather than is_active.
  const ids = [...byEmp.keys()];
  const { data: users } = ids.length
    ? await admin.from("users").select("id, full_name, email, department").in("id", ids)
    : { data: [] as any[] };
  const umap = new Map((users ?? []).map((u: any) => [u.id, u]));

  const period = `${from} → ${to}`;
  const rows: NightDiffPeriodRow[] = [];
  for (const [id, acc] of byEmp) {
    const u: any = umap.get(id) ?? {};
    const detail = [...acc.byShift.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([shift, v]) => `${shift}: ${v.days}d, ${round(v.hours)}h`)
      .join("; ");
    rows.push({
      employee_id: id,
      employee_name: u.full_name ?? u.email ?? id,
      employee_email: u.email ?? "",
      department: u.department ?? "",
      period,
      nd_days: acc.dates.size,
      nd_hours: round(acc.total),
      nd_detail: detail,
    });
  }
  rows.sort(
    (a, b) =>
      b.nd_hours - a.nd_hours || a.employee_name.localeCompare(b.employee_name)
  );
  return rows;
}
