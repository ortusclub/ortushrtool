/**
 * Parsers for the two ways punches reach us:
 *   1. The scanner's export file (weekly CSV/TXT, uploaded by HR)
 *   2. The device's own ADMS/PUSH feed (ATTLOG posts, live per scan)
 *
 * Both normalise to the same ParsedPunch shape so the ingest path downstream
 * is identical. Punch times carry the Asia/Manila offset explicitly — the
 * scanner reports local wall-clock time with no zone marker.
 */

export const MANILA_OFFSET = "+08:00";

export type ParsedPunch = {
  biometric_id: number;
  /** Present in the export file, absent in ADMS posts (which send only a PIN). */
  name: string | null;
  /** ISO 8601 with the Manila offset. */
  punch_time: string;
  /** The value as it appeared in the source, for error display. */
  raw_datetime: string;
};

export type ParseOutcome = { rows: ParsedPunch[]; errors: string[] };

/** "2026/04/01  01:11:19" or "2026-04-01 01:11" → ISO with Manila offset. */
function toIsoManila(dateTime: string): string | null {
  const m = dateTime.match(
    /^(\d{4})[/-](\d{2})[/-](\d{2})[\sT]+(\d{2}:\d{2}(?::\d{2})?)/
  );
  if (!m) return null;
  const [, y, mo, d, t] = m;
  const time = t.length === 5 ? `${t}:00` : t;
  return `${y}-${mo}-${d}T${time}${MANILA_OFFSET}`;
}

/**
 * The scanner export. Rows are whitespace/tab-delimited:
 *   No  Mchn  EnNo        Name       Mode  IOMd  DateTime
 *   1   1     0000000050  Japheth    033   001   2026/04/01  01:11:19
 *
 * EnNo is a zero-padded integer (the biometric_id).
 */
export function parseBiometricExport(text: string): ParseOutcome {
  const rows: ParsedPunch[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Header, in any casing.
    if (/\bEnNo\b/i.test(line) && /\bDateTime\b/i.test(line)) continue;

    // Tabs, or runs of 2+ spaces. The single space inside "date time" is
    // handled by the DateTime regex rather than the column split.
    const parts = line.split(/\t+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 7) {
      errors.push(`Line ${i + 1}: expected 7 columns, got ${parts.length}`);
      continue;
    }
    const [, , enNo, name, , , dateCol] = parts;

    // The DateTime column may itself contain the 2+ spaces we just split on
    // ("2026/04/01  01:11:19"), which would leave the date and time in
    // adjacent columns. Re-join them when the date column has no time and the
    // next one looks like one, so tab-, one-space- and two-space-separated
    // exports all read the same.
    let dateTime = dateCol;
    if (!/\d{2}:\d{2}/.test(dateCol) && /^\d{2}:\d{2}(:\d{2})?$/.test(parts[7] ?? "")) {
      dateTime = `${dateCol} ${parts[7]}`;
    }

    const biometric_id = parseInt(enNo, 10);
    if (!Number.isFinite(biometric_id)) {
      errors.push(`Line ${i + 1}: bad EnNo "${enNo}"`);
      continue;
    }
    const punch_time = toIsoManila(dateTime);
    if (!punch_time) {
      errors.push(`Line ${i + 1}: bad DateTime "${dateTime}"`);
      continue;
    }
    rows.push({ biometric_id, name, punch_time, raw_datetime: dateTime });
  }
  return { rows, errors };
}

/**
 * An ADMS/PUSH ATTLOG body. The device posts plain text, one record per line,
 * tab-delimited, with no header:
 *
 *   PIN \t YYYY-MM-DD HH:MM:SS \t Status \t VerifyMode \t WorkCode \t Reserved…
 *
 * Only PIN and the timestamp matter to us — the device is a door scanner, so
 * its in/out Status flag reflects which reader was touched, not a considered
 * clock-in, and we deliberately don't read meaning into it.
 */
export function parseAdmsAttlog(body: string): ParseOutcome {
  const rows: ParsedPunch[] = [];
  const errors: string[] = [];
  const lines = body.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\t+/).map((s) => s.trim());
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: expected at least PIN and timestamp`);
      continue;
    }
    const [pin, dateTime] = parts;

    const biometric_id = parseInt(pin, 10);
    if (!Number.isFinite(biometric_id)) {
      errors.push(`Line ${i + 1}: bad PIN "${pin}"`);
      continue;
    }
    const punch_time = toIsoManila(dateTime);
    if (!punch_time) {
      errors.push(`Line ${i + 1}: bad timestamp "${dateTime}"`);
      continue;
    }
    rows.push({ biometric_id, name: null, punch_time, raw_datetime: dateTime });
  }
  return { rows, errors };
}

/** The Asia/Manila calendar date a punch falls on. */
export function manilaDate(punchTime: string): string {
  return new Date(punchTime).toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
}

/** The Asia/Manila hour (0-23) a punch falls in. */
export function manilaHour(punchTime: string): number {
  return parseInt(
    new Date(punchTime).toLocaleString("en-GB", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      hour12: false,
    }),
    10
  );
}

/**
 * The working day a punch should be counted against.
 *
 * The scanner is the office door, so a night shift produces exit taps in the
 * small hours of the FOLLOWING calendar date. Bucketing on the raw date makes
 * those look like attendance for a day the person never worked — and because
 * All Attendance treats the earliest punch as the canonical clock-in, a 00:05
 * exit was being read as an on-time arrival.
 *
 * So anything before `cutoffHour` is attributed to the previous day, matching
 * what desktime-sync already does with `shift_cutoff_hour` (default 5am) so
 * the two sources can't disagree about which day a shift belongs to.
 */
export function attendanceDate(punchTime: string, cutoffHour: number): string {
  const date = manilaDate(punchTime);
  if (manilaHour(punchTime) >= cutoffHour) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Reduces a stream of punches to the FIRST one per employee per Manila day.
 *
 * The scanner doubles as the office door, so a person taps it several times a
 * day — arriving, lunch, stepping out, going home. Only the earliest tap
 * represents arrival, so that's the one attendance should read. Every punch is
 * still stored: "first" is a view over the raw record, never a filter applied
 * at ingest, so this can be re-derived if the rule changes.
 *
 * Keyed `${employee_id}:${YYYY-MM-DD}`.
 */
export function firstPunchPerDay<T extends { employee_id: string; punch_time: string }>(
  punches: T[],
  cutoffHour = 5
): Map<string, T> {
  const first = new Map<string, T>();
  for (const p of punches) {
    const key = `${p.employee_id}:${attendanceDate(p.punch_time, cutoffHour)}`;
    const held = first.get(key);
    if (!held || p.punch_time < held.punch_time) first.set(key, p);
  }
  return first;
}
