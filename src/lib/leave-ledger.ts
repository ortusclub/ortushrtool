import { countLeaveDays } from "@/lib/leave-days";

export type LedgerEntry = {
  date: string; // YYYY-MM-DD
  label: string;
  delta: number; // signed day count
  running: number; // running balance after this entry
  kind: "allocation" | "credit" | "leave";
};

export type LeaveBalance = {
  available: number;
  usedDays: number;
  usedCount: number; // number of distinct leave events
  entries: LedgerEntry[];
};

export type CreditRow = {
  days: number;
  granted_at: string;
  notes: string | null;
  source: string | null;
  expires_at: string | null;
};

export type LeaveRow = {
  leave_type: string;
  leave_duration: string;
  start_date: string;
  end_date: string;
  status?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds a per-leave-type ledger for the CURRENT cycle only.
 *
 * The balance is fluid — there's no fixed "max". It opens with the cycle's
 * (prorated) plan allocation, then every credit and every approved leave for
 * that cycle is an add/subtract line, running down to what's available now.
 *
 * Credits and leaves are both scoped to `cycleStart`, so a new cycle opens
 * fresh: prior-cycle credits and leaves drop off automatically (CTO and any
 * other credit are therefore use-it-or-lose-it within the cycle). Expired
 * credits (past expires_at) are excluded too.
 */
export function buildLeaveLedger(args: {
  leaveType: string;
  planBase: number;
  cycleStart: string;
  credits: CreditRow[];
  leaves: LeaveRow[];
  holidays: Set<string>;
  today: string;
}): LeaveBalance {
  const { leaveType, planBase, cycleStart, credits, leaves, holidays, today } = args;

  const entries: LedgerEntry[] = [];

  // Opening line: the cycle's plan allocation (may be 0 for credit-only types).
  if (planBase !== 0) {
    entries.push({
      date: cycleStart,
      label: `Plan allocation (cycle start)`,
      delta: r2(planBase),
      running: 0,
      kind: "allocation",
    });
  }

  // Credits granted within this cycle and still active (not expired).
  for (const c of credits) {
    const granted = c.granted_at.slice(0, 10);
    if (granted < cycleStart || granted > today) continue;
    if (c.expires_at && c.expires_at < today) continue;
    const days = Number(c.days);
    const note = c.notes?.trim();
    const label =
      days >= 0
        ? note
          ? `Credit — ${note}`
          : c.source === "holiday_work"
            ? "Earned CTO (holiday work)"
            : "Manual credit"
        : note
          ? `Deduction — ${note}`
          : "Manual deduction";
    entries.push({ date: granted, label, delta: r2(days), running: 0, kind: "credit" });
  }

  // Approved leaves taken within this cycle.
  let usedDays = 0;
  let usedCount = 0;
  for (const l of leaves) {
    if (l.leave_type !== leaveType) continue;
    if ((l.status ?? "approved") !== "approved") continue;
    if (l.start_date < cycleStart) continue;
    const days =
      l.leave_duration === "half_day"
        ? 0.5
        : countLeaveDays(l.start_date, l.end_date, holidays);
    if (days === 0) continue;
    usedDays += days;
    usedCount += 1;
    const range =
      l.start_date === l.end_date || l.leave_duration === "half_day"
        ? l.start_date
        : `${l.start_date} → ${l.end_date}`;
    entries.push({
      date: l.start_date,
      label: `Leave taken (${range})${l.leave_duration === "half_day" ? " · half day" : ""}`,
      delta: r2(-days),
      running: 0,
      kind: "leave",
    });
  }

  // Sort by date, then fill in the running balance.
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let running = 0;
  for (const e of entries) {
    running = r2(running + e.delta);
    e.running = running;
  }

  return { available: running, usedDays: r2(usedDays), usedCount, entries };
}
