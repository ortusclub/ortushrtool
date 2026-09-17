"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Non-blocking nudge when a picked date falls outside the current calendar
 * year. A leave filed as 0006-06-29 (meant 2026) sat in the ledger for three
 * months uncharged and broke the calendar feed for everyone; an adjustment
 * filed as 2003 landed twenty-three years back. Both were single mistyped
 * digits the form happily accepted. Past dates *within* the year are normal
 * (emergency leave filed after the fact) and stay silent.
 *
 * For leave the message spells out the consequence — the days charge that
 * year's balance, not this year's — since that's what makes someone look
 * twice. Adjustments and overtime have no balance, so they get a plain check.
 */
export function oddDateWarning(
  dates: Array<string | null | undefined>,
  kind: "leave" | "generic" = "generic",
  today: Date = new Date()
): string | null {
  const thisYear = today.getFullYear();
  for (const d of dates) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const year = Number(d.slice(0, 4));
    if (year === thisYear) continue;
    const shown = d.slice(0, 4); // as typed — "0006", not "6"

    const gap = Math.abs(year - thisYear);
    const past = year < thisYear;
    const when = gap === 1
      ? past ? "last year" : "next year"
      : past ? `${gap} years ago` : `${gap} years from now`;
    const hint = gap > 1 ? ` Did you mean ${thisYear}?` : "";

    if (kind === "leave") {
      return `You are filing for a ${past ? "past" : "future"} date in ${shown} (${when}). Please ensure this is the correct date for your leave, as it will be charged to your ${shown} balance.${hint}`;
    }
    return `You are filing for a ${past ? "past" : "future"} date in ${shown} (${when}). Please ensure this is the correct date.${hint}`;
  }
  return null;
}

export function OddDateWarning({
  dates,
  kind = "generic",
}: {
  dates: Array<string | null | undefined>;
  kind?: "leave" | "generic";
}) {
  const message = oddDateWarning(dates, kind);
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
      <p>{message}</p>
    </div>
  );
}
