import { differenceInMonths, parseISO } from "date-fns";

/**
 * Prorates leave entitlement for new hires in their first renewal cycle.
 *
 * Formula: (completed months from hire to next renewal / 12) × annual entitlement
 *
 * Returns the full annual entitlement if the employee started before the
 * current renewal period (i.e. they've already been through at least one cycle).
 *
 * @param annualDays     Full annual allocation for this leave type
 * @param hireDate       Employee's hire/start date (ISO string)
 * @param renewalStart   Start of the current renewal period (ISO string)
 * @param renewalMonth   Month of the renewal date (1-12)
 * @param renewalDay     Day of the renewal date (1-31)
 */
export function prorateLeave(
  annualDays: number,
  hireDate: string | null,
  renewalStart: string,
  renewalMonth: number,
  renewalDay: number
): number {
  if (!hireDate) return annualDays;

  // If hired before or on the renewal start, they get the full allocation
  if (hireDate <= renewalStart) return annualDays;

  // Employee was hired during this renewal cycle — prorate
  const hire = parseISO(hireDate);

  // Calculate the next renewal date (end of this cycle)
  const renewalStartDate = parseISO(renewalStart);
  const nextRenewalYear = renewalStartDate.getFullYear() + 1;
  const nextRenewal = new Date(nextRenewalYear, renewalMonth - 1, renewalDay);

  // Completed months from hire date to next renewal
  const months = differenceInMonths(nextRenewal, hire);

  if (months <= 0) return 0;

  const prorated = Math.round(((months / 12) * annualDays) * 100) / 100;
  return prorated;
}
