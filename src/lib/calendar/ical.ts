/**
 * Minimal RFC 5545 (iCalendar) generator. Just enough for our use case:
 * all-day events, timed events, and yearly-recurring events (birthdays,
 * anniversaries). Not a general-purpose library — designed for our shapes.
 */

export type CalendarEvent = {
  /** Globally unique ID — must remain stable across regenerations of the same event. */
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /** All-day event date (YYYY-MM-DD). Mutually exclusive with `start` / `end`. */
  date?: string;
  /** Timed event start (ISO with timezone). Pair with `end`. */
  start?: string;
  end?: string;
  /** If set, event repeats yearly (used for birthdays, anniversaries). */
  rruleYearly?: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toICalDate(yyyymmdd: string): string {
  return yyyymmdd.replace(/-/g, "");
}

function toICalDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function nowStamp(): string {
  return toICalDateTimeUTC(new Date().toISOString());
}

/**
 * iCal text fields require escaping commas, semicolons, backslashes, and
 * newlines. Lines longer than 75 octets must also be folded — we keep our
 * lines short by construction so we skip folding here.
 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildICal({
  calendarName,
  events,
}: {
  calendarName: string;
  events: CalendarEvent[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ortus Club HR//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Manila",
    // Tell subscribers (Google/Apple/Outlook) to re-poll hourly. Without a
    // hint, clients fall back to their own lazy default (often 24h+), so newly
    // approved leaves — and dropped cancelled ones — can take days to appear.
    // It's a hint, not a guarantee, but far better than emitting nothing.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${nowStamp()}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.date) {
      const d = toICalDate(e.date);
      lines.push(`DTSTART;VALUE=DATE:${d}`);
      // For all-day events DTEND is the day AFTER the last day. We treat
      // single-day all-day events as start = end+1, which is what Google expects.
      const next = new Date(`${e.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const endStr =
        next.getUTCFullYear() +
        pad(next.getUTCMonth() + 1) +
        pad(next.getUTCDate());
      lines.push(`DTEND;VALUE=DATE:${endStr}`);
    } else if (e.start && e.end) {
      lines.push(`DTSTART:${toICalDateTimeUTC(e.start)}`);
      lines.push(`DTEND:${toICalDateTimeUTC(e.end)}`);
    }
    if (e.rruleYearly) {
      lines.push("RRULE:FREQ=YEARLY");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
