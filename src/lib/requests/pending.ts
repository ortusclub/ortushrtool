import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The four request types an employee's direct manager approves. Kept in one
 * place so the reminder cron, the flag rows it writes, and anything that
 * renders them all agree on the kinds and their labels.
 *
 * The HR-queue types (document requests, permanent schedule changes,
 * concerns, peer feedback) are deliberately NOT here — they're approved by
 * HR rather than a direct manager, so they'd need a different recipient.
 */
export type PendingRequestKind =
  | "leave"
  | "schedule_adjustment"
  | "overtime"
  | "holiday_work";

export const REQUEST_KIND_LABELS: Record<PendingRequestKind, string> = {
  leave: "Leave",
  schedule_adjustment: "Schedule Adjustment",
  overtime: "Overtime",
  holiday_work: "Holiday Work",
};

/** Where each kind lives, and how to describe one in a single line. */
const SOURCES: Array<{
  kind: PendingRequestKind;
  table: string;
  columns: string;
  summarize: (row: any) => string;
}> = [
  {
    kind: "leave",
    table: "leave_requests",
    columns:
      "id, employee_id, created_at, leave_type, leave_duration, start_date, end_date",
    summarize: (r) => {
      const label = LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type;
      const range =
        r.start_date === r.end_date
          ? r.start_date
          : `${r.start_date} → ${r.end_date}`;
      const half = r.leave_duration === "half_day" ? " · half day" : "";
      return `${label} · ${range}${half}`;
    },
  },
  {
    kind: "schedule_adjustment",
    table: "schedule_adjustments",
    columns:
      "id, employee_id, created_at, requested_date, requested_start_time, requested_end_time",
    summarize: (r) =>
      `${r.requested_date} · ${r.requested_start_time} - ${r.requested_end_time}`,
  },
  {
    kind: "overtime",
    table: "overtime_requests",
    columns: "id, employee_id, created_at, requested_date, start_time, end_time",
    summarize: (r) => `${r.requested_date} · ${r.start_time} - ${r.end_time}`,
  },
  {
    kind: "holiday_work",
    table: "holiday_work_requests",
    columns:
      "id, employee_id, created_at, holiday_date, start_time, end_time, work_location",
    summarize: (r) =>
      `${r.holiday_date} · ${r.start_time} - ${r.end_time} · ${
        r.work_location === "office" ? "Office" : "Online"
      }`,
  },
];

export type StalePendingRequest = {
  kind: PendingRequestKind;
  id: string;
  employeeId: string;
  createdAt: string;
  summary: string;
  daysPending: number;
};

/**
 * Every still-pending request across all four types that was submitted on or
 * before `cutoffISO` — i.e. has been waiting at least the configured number
 * of days. `now` is passed in so the day count and the cutoff agree.
 */
export async function fetchStalePendingRequests(
  admin: SupabaseClient,
  cutoffISO: string,
  now: Date
): Promise<StalePendingRequest[]> {
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      const { data, error } = await admin
        .from(src.table)
        .select(src.columns)
        .eq("status", "pending")
        .lte("created_at", cutoffISO);
      if (error) throw new Error(`${src.table}: ${error.message}`);
      return (data ?? []).map((row: any) => ({
        kind: src.kind,
        id: row.id as string,
        employeeId: row.employee_id as string,
        createdAt: row.created_at as string,
        summary: src.summarize(row),
        daysPending: Math.floor(
          (now.getTime() - new Date(row.created_at).getTime()) / 86_400_000
        ),
      }));
    })
  );
  return results.flat();
}

/**
 * The ids of requests that are STILL pending, out of a set already flagged.
 * Used to retire flags whose request has since been approved, rejected, or
 * deleted — the cron owns that cleanup, so flags never outlive their request.
 */
export async function fetchStillPendingIds(
  admin: SupabaseClient,
  idsByKind: Map<PendingRequestKind, string[]>
): Promise<Set<string>> {
  const alive = new Set<string>();
  await Promise.all(
    SOURCES.map(async (src) => {
      const ids = idsByKind.get(src.kind);
      if (!ids?.length) return;
      const { data, error } = await admin
        .from(src.table)
        .select("id")
        .eq("status", "pending")
        .in("id", ids);
      if (error) throw new Error(`${src.table}: ${error.message}`);
      for (const row of data ?? []) alive.add(`${src.kind}:${row.id}`);
    })
  );
  return alive;
}
