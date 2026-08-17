/**
 * Counts business days (Mon-Fri) between two YYYY-MM-DD dates inclusive,
 * excluding any date in the provided holiday set. Used to deduct used
 * leave days from a balance — a public holiday landing inside an approved
 * leave range shouldn't be charged as a leave day.
 */
export function countLeaveDays(
  start: string,
  end: string,
  holidays: Set<string>
): number {
  if (!start || !end || end < start) return 0;
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  let n = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) {
      const yyyy = cur.getUTCFullYear();
      const mm = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(cur.getUTCDate()).padStart(2, "0");
      if (!holidays.has(`${yyyy}-${mm}-${dd}`)) n++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
}

/**
 * Counts the leave days a request contributes to ONE cycle.
 *
 * A leave range can straddle a cycle boundary — Dec 28 → Jan 4 under a
 * calendar-year plan. Charging the whole span to the cycle its start_date
 * falls in lets an employee drain the closing cycle's pool with days they'll
 * actually take in the new one, and makes the leave vanish from the balance
 * entirely once the cycle rolls (its start_date is then before the cycle
 * start). So each cycle is charged only for the days that fall inside it,
 * and a straddling leave shows up in both cycles for its respective part.
 *
 * A half day is a single date and belongs wholly to the cycle containing it.
 */
export function countLeaveDaysInCycle(
  leave: { start_date: string; end_date: string; leave_duration?: string | null },
  holidays: Set<string>,
  cycleStart: string,
  cycleEnd: string
): number {
  if (leave.leave_duration === "half_day") {
    return leave.start_date >= cycleStart && leave.start_date <= cycleEnd ? 0.5 : 0;
  }
  const from = leave.start_date > cycleStart ? leave.start_date : cycleStart;
  const to = leave.end_date < cycleEnd ? leave.end_date : cycleEnd;
  if (to < from) return 0;
  return countLeaveDays(from, to, holidays);
}

/**
 * True when any part of the leave falls inside the cycle window. Cheap
 * pre-filter — countLeaveDaysInCycle returns 0 for non-overlapping leaves
 * anyway, but callers use this to skip building ledger entries for them.
 */
export function overlapsCycle(
  leave: { start_date: string; end_date: string },
  cycleStart: string,
  cycleEnd: string
): boolean {
  return leave.end_date >= cycleStart && leave.start_date <= cycleEnd;
}

/**
 * Builds a Set of YYYY-MM-DD strings from raw holiday rows, restricted to
 * a date range. Recurring rows (is_recurring=true) are expanded across
 * every year that overlaps the range using the row's stored month/day.
 */
export function buildHolidaySet(
  rows: Array<{ date: string; is_recurring: boolean | null }>,
  fromDate: string,
  toDate: string
): Set<string> {
  const set = new Set<string>();
  const fromYear = parseInt(fromDate.slice(0, 4));
  const toYear = parseInt(toDate.slice(0, 4));
  for (const h of rows) {
    if (!h.is_recurring) {
      if (h.date >= fromDate && h.date <= toDate) set.add(h.date);
      continue;
    }
    const md = h.date.slice(5); // "MM-DD"
    for (let y = fromYear; y <= toYear; y++) {
      const candidate = `${y}-${md}`;
      if (candidate >= fromDate && candidate <= toDate) set.add(candidate);
    }
  }
  return set;
}
