import { differenceInMonths, parseISO } from "date-fns";
import type { GrantType } from "@/types/database";

/**
 * Computes the most recent renewal start date for a given employee,
 * based on the plan's grant_type.
 *
 * - "custom": uses the plan's renewal_month/renewal_day (same for everyone)
 * - "hire_date": uses the employee's hire_date month/day
 * - "anniversary": uses the employee's hire_date month/day (same as hire_date,
 *   but allocation is 0 before first anniversary — handled by prorateLeave)
 */
export function getRenewalStart(
  grantType: GrantType,
  renewalMonth: number,
  renewalDay: number,
  hireDate: string | null,
  today: string
): { renewalStart: string; month: number; day: number } {
  const nowYear = parseInt(today.slice(0, 4));

  if ((grantType === "hire_date" || grantType === "anniversary") && hireDate) {
    const hire = parseISO(hireDate);
    const month = hire.getMonth() + 1;
    const day = hire.getDate();
    const thisYear = `${nowYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const lastYear = `${nowYear - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return {
      renewalStart: thisYear <= today ? thisYear : lastYear,
      month,
      day,
    };
  }

  // "custom" — use the fixed renewal_month/renewal_day
  const thisYear = `${nowYear}-${String(renewalMonth).padStart(2, "0")}-${String(renewalDay).padStart(2, "0")}`;
  const lastYear = `${nowYear - 1}-${String(renewalMonth).padStart(2, "0")}-${String(renewalDay).padStart(2, "0")}`;
  return {
    renewalStart: thisYear <= today ? thisYear : lastYear,
    month: renewalMonth,
    day: renewalDay,
  };
}

/**
 * Prorates leave entitlement for new hires.
 *
 * - "custom" / "hire_date": prorates based on completed months from hire
 *   to next renewal, if the employee started during the current cycle.
 * - "anniversary": returns 0 if the employee hasn't reached their 1st
 *   anniversary yet, full allocation otherwise (no proration).
 */
export function prorateLeave(
  annualDays: number,
  hireDate: string | null,
  renewalStart: string,
  renewalMonth: number,
  renewalDay: number,
  grantType: GrantType = "custom"
): number {
  if (!hireDate) return annualDays;

  if (grantType === "anniversary") {
    // Check if employee has reached at least their 1st anniversary
    const hire = parseISO(hireDate);
    const now = new Date();
    const monthsSinceHire = differenceInMonths(now, hire);
    if (monthsSinceHire < 12) return 0;
    return annualDays;
  }

  // "custom" and "hire_date": prorate for first cycle
  if (hireDate <= renewalStart) return annualDays;

  const hire = parseISO(hireDate);
  const renewalStartDate = parseISO(renewalStart);
  const nextRenewalYear = renewalStartDate.getFullYear() + 1;
  const nextRenewal = new Date(nextRenewalYear, renewalMonth - 1, renewalDay);

  const months = differenceInMonths(nextRenewal, hire);
  if (months <= 0) return 0;

  return Math.round(((months / 12) * annualDays) * 100) / 100;
}
