import type { SupabaseClient } from "@supabase/supabase-js";
import { getRenewalStart, prorateLeave } from "@/lib/leave-proration";
import { buildHolidaySet, countLeaveDays } from "@/lib/leave-days";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import type { GrantType } from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type LeaveBalanceRow = {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  leave_type: string;
  leave_type_label: string;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
  renewal_start: string;
  plan_name: string;
};

/**
 * Computes current-cycle leave balances for every active employee × every
 * leave type they have an allocation for. One row per (employee, type).
 *
 * Mirrors the dashboard's per-user logic but at the company level.
 */
export async function computeLeaveBalances(
  admin: SupabaseClient
): Promise<LeaveBalanceRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: employees },
    { data: assignments },
    { data: plans },
    { data: allocations },
    { data: leaves },
    { data: ctoGrants },
  ] = await Promise.all([
    admin
      .from("users")
      .select("id, full_name, email, department, hire_date, holiday_country")
      .eq("is_active", true),
    admin.from("employee_leave_plans").select("employee_id, plan_id"),
    admin
      .from("leave_plans")
      .select("id, name, grant_type, renewal_month, renewal_day"),
    admin
      .from("leave_plan_allocations")
      .select("plan_id, leave_type, days_per_year"),
    admin
      .from("leave_requests")
      .select("employee_id, leave_type, start_date, end_date, leave_duration")
      .eq("status", "approved"),
    admin
      .from("cto_grants")
      .select("employee_id, days, granted_at"),
  ]);

  // All public holidays, grouped by country → set of YYYY-MM-DD covering
  // the years relevant to leave balances. Used to subtract holiday weekdays
  // from each employee's "used" count.
  const todayYear = parseInt(today.slice(0, 4));
  const holidayRangeFrom = `${todayYear - 2}-01-01`;
  const holidayRangeTo = `${todayYear + 1}-12-31`;
  const { data: allHolidays } = await admin
    .from("holidays")
    .select("country, date, is_recurring");
  const holidayByCountry = new Map<string, Set<string>>();
  const holidaysByCountryRaw = new Map<string, { date: string; is_recurring: boolean | null }[]>();
  for (const h of allHolidays ?? []) {
    if (!holidaysByCountryRaw.has(h.country)) holidaysByCountryRaw.set(h.country, []);
    holidaysByCountryRaw.get(h.country)!.push({ date: h.date, is_recurring: h.is_recurring });
  }
  for (const [country, rows] of holidaysByCountryRaw) {
    holidayByCountry.set(country, buildHolidaySet(rows, holidayRangeFrom, holidayRangeTo));
  }

  // Sum earned CTO per employee and remember the earliest grant date.
  const earnedCtoByEmp = new Map<string, { days: number; earliest: string }>();
  for (const g of (ctoGrants ?? []) as { employee_id: string; days: number; granted_at: string }[]) {
    const grantDate = g.granted_at.slice(0, 10);
    const existing = earnedCtoByEmp.get(g.employee_id);
    if (existing) {
      existing.days += Number(g.days);
      if (grantDate < existing.earliest) existing.earliest = grantDate;
    } else {
      earnedCtoByEmp.set(g.employee_id, {
        days: Number(g.days),
        earliest: grantDate,
      });
    }
  }

  const planById = new Map<string, any>(
    (plans ?? []).map((p) => [p.id, p])
  );
  const allocsByPlan = new Map<string, any[]>();
  for (const a of allocations ?? []) {
    if (!allocsByPlan.has(a.plan_id)) allocsByPlan.set(a.plan_id, []);
    allocsByPlan.get(a.plan_id)!.push(a);
  }
  const planIdsByEmp = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    if (!planIdsByEmp.has(a.employee_id)) planIdsByEmp.set(a.employee_id, []);
    planIdsByEmp.get(a.employee_id)!.push(a.plan_id);
  }
  const leavesByEmp = new Map<string, any[]>();
  for (const l of leaves ?? []) {
    if (!leavesByEmp.has(l.employee_id)) leavesByEmp.set(l.employee_id, []);
    leavesByEmp.get(l.employee_id)!.push(l);
  }

  const rows: LeaveBalanceRow[] = [];

  for (const emp of employees ?? []) {
    const empPlans = planIdsByEmp.get(emp.id) ?? [];
    const earned = earnedCtoByEmp.get(emp.id);
    if (empPlans.length === 0 && !earned) continue;

    // One bucket per leave_type, aggregated across all the employee's plans
    type Bucket = {
      allocated: number;
      plans: Set<string>;
      renewalStart: string;
    };
    const buckets = new Map<string, Bucket>();

    for (const planId of empPlans) {
      const plan = planById.get(planId);
      if (!plan) continue;
      const allocs = allocsByPlan.get(planId) ?? [];
      for (const a of allocs) {
        const { renewalStart, month, day } = getRenewalStart(
          plan.grant_type as GrantType,
          plan.renewal_month,
          plan.renewal_day,
          emp.hire_date,
          today
        );
        const prorated = prorateLeave(
          a.days_per_year,
          emp.hire_date,
          renewalStart,
          month,
          day,
          plan.grant_type as GrantType
        );
        const existing = buckets.get(a.leave_type);
        if (existing) {
          existing.allocated += prorated;
          existing.plans.add(plan.name);
          // Use the most recent cycle start across overlapping plans
          if (renewalStart > existing.renewalStart) {
            existing.renewalStart = renewalStart;
          }
        } else {
          buckets.set(a.leave_type, {
            allocated: prorated,
            plans: new Set([plan.name]),
            renewalStart,
          });
        }
      }
    }

    // Fold in earned CTO (auto-grants from approved holiday-work). Earned
    // credits don't expire, so they collapse the bucket's renewalStart to the
    // earliest grant date — every approved CTO leave since then counts as
    // used.
    if (earned && earned.days > 0) {
      const existing = buckets.get("cto");
      if (existing) {
        existing.allocated += earned.days;
        existing.plans.add("Earned CTO");
        if (earned.earliest < existing.renewalStart) {
          existing.renewalStart = earned.earliest;
        }
      } else {
        buckets.set("cto", {
          allocated: earned.days,
          plans: new Set(["Earned CTO"]),
          renewalStart: earned.earliest,
        });
      }
    }

    const empLeaves = leavesByEmp.get(emp.id) ?? [];
    const empHolidays = holidayByCountry.get(emp.holiday_country) ?? new Set<string>();

    for (const [leaveType, bucket] of buckets) {
      const used = empLeaves
        .filter(
          (l) =>
            l.leave_type === leaveType && l.start_date >= bucket.renewalStart
        )
        .reduce((sum, l) => {
          if (l.leave_duration === "half_day") return sum + 0.5;
          return sum + countLeaveDays(l.start_date, l.end_date, empHolidays);
        }, 0);

      const allocated = Math.round(bucket.allocated * 100) / 100;
      // CTO can go negative when an earned grant is revoked after the credit
      // has already been used. Other leave types stay clamped at zero — they
      // never auto-revoke and a negative there would only confuse readers.
      const rawRemaining = Math.round((bucket.allocated - used) * 100) / 100;
      const remaining =
        leaveType === "cto" ? rawRemaining : Math.max(0, rawRemaining);

      rows.push({
        employee_id: emp.id,
        employee_name: emp.full_name || "",
        employee_email: emp.email || "",
        department: emp.department || "",
        leave_type: leaveType,
        leave_type_label: LEAVE_TYPE_LABELS[leaveType] ?? leaveType,
        allocated_days: allocated,
        used_days: used,
        remaining_days: remaining,
        renewal_start: bucket.renewalStart,
        plan_name: Array.from(bucket.plans).join(", "),
      });
    }
  }

  rows.sort((a, b) => {
    if (a.employee_name !== b.employee_name)
      return a.employee_name.localeCompare(b.employee_name);
    return a.leave_type.localeCompare(b.leave_type);
  });

  return rows;
}
