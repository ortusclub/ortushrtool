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
  /** Last day (inclusive, YYYY-MM-DD) for a multi-day all-day event. Defaults
   * to `date` (single day). Lets one leave be ONE spanning event instead of
   * one event per day. */
  dateEnd?: string;
  /** Timed event start (ISO with timezone). Pair with `end`. */
  start?: string;
  end?: string;
  /** If set, event repeats yearly (used for birthdays, anniversaries). */
  rruleYearly?: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Four-digit year. getUTCFullYear() returns 6 for year 0006, and an
 * unpadded "6" makes DTEND "60630" — not a date at all. */
function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Only emit events whose dates a calendar client can actually parse.
 *
 * A typo'd year (0006-06-29 filed as an emergency half-day) is legal in
 * Postgres and produced a DTEND of "60630". Google rejects a feed with one
 * unparseable event silently and wholesale, so a single bad row took the
 * whole subscription down for everyone in scope. Recurring birthdays go
 * back to the 1970s, so the floor is 1900, not "recent".
 */
const SANE_YEAR_MIN = 1900;
const SANE_YEAR_MAX = 2100;
function isSaneDate(yyyymmdd: string | undefined): boolean {
  if (!yyyymmdd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return false;
  const y = Number(yyyymmdd.slice(0, 4));
  return y >= SANE_YEAR_MIN && y <= SANE_YEAR_MAX;
}
function isSaneInstant(iso: string | undefined): boolean {
  if (!iso) return false;
  const y = new Date(iso).getUTCFullYear();
  return !Number.isNaN(y) && y >= SANE_YEAR_MIN && y <= SANE_YEAR_MAX;
}

function toICalDate(yyyymmdd: string): string {
  return yyyymmdd.replace(/-/g, "");
}

function toICalDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  return (
    pad4(d.getUTCFullYear()) +
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
 * newlines. Folding of long lines is done separately in fold().
 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 line folding: no content line may exceed 75 octets; longer
 * ones continue on the next line prefixed with a single space. Measured in
 * UTF-8 octets, not characters — names carry ñ and é and summaries use an
 * em-dash — and never split inside a multi-byte sequence. DESCRIPTION
 * carries free-text reasons, one of which was 655 characters, so "short by
 * construction" was never true.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const max = first ? 75 : 74; // continuation lines spend one octet on the space
    let j = Math.min(i + max, bytes.length);
    // Back up off any UTF-8 continuation byte (10xxxxxx) so we split between
    // characters, not through one.
    while (j < bytes.length && j > i && (bytes[j] & 0xc0) === 0x80) j--;
    out.push((first ? "" : " ") + bytes.subarray(i, j).toString("utf8"));
    i = j;
    first = false;
  }
  return out.join("\r\n");
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
  ];

  for (const e of events) {
    // Drop, don't emit, anything a client couldn't parse — see isSaneDate.
    if (e.date) {
      if (!isSaneDate(e.date) || (e.dateEnd && !isSaneDate(e.dateEnd))) continue;
    } else if (!isSaneInstant(e.start) || !isSaneInstant(e.end)) {
      continue;
    }
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${nowStamp()}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.date) {
      lines.push(`DTSTART;VALUE=DATE:${toICalDate(e.date)}`);
      // All-day DTEND is exclusive — the day AFTER the last day. For a single
      // day that's start+1; for a range it's (dateEnd)+1. One spanning event
      // per multi-day leave instead of one event per day.
      const next = new Date(`${e.dateEnd ?? e.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const endStr =
        pad4(next.getUTCFullYear()) +
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
  return lines.map(fold).join("\r\n") + "\r\n";
}
