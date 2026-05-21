import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const VALID_LEAVE_TYPES = new Set([
  "anniversary", "annual", "birthday", "cto", "trinity",
  "maternity_paternity", "solo_parent", "bereavement",
]);

const LEAVE_TYPE_ALIASES: Record<string, string> = {
  "anniversary leave": "anniversary",
  "annual leave": "annual",
  "birthday leave": "birthday",
  "cto leave": "cto",
  "trinity leave": "trinity",
  "maternity/paternity leave": "maternity_paternity",
  "maternity leave": "maternity_paternity",
  "paternity leave": "maternity_paternity",
  "solo parent leave": "solo_parent",
  "bereavement leave": "bereavement",
};

// Duration token used by the CSV: `full` = whole day, `am` / `pm` = half
// day on that period.
type DurationToken = "full" | "am" | "pm";

interface ParsedRow {
  rowNum: number;
  email: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  durationFrom: DurationToken;
  durationTo: DurationToken;
  expectedTotalDays: number | null;
  // Per-row override of the import-level auto-approve toggle. Undefined
  // means "fall back to the UI checkbox"; "approved" / "pending" set the
  // row explicitly.
  statusOverride?: "approved" | "pending";
  reason: string;
  parseError?: string;
}

type Split = {
  startDate: string;
  endDate: string;
  duration: "full_day" | "half_day";
  period: "am" | "pm" | null;
};

function parseDurationToken(raw: string): DurationToken | null {
  const v = raw.trim().toLowerCase();
  if (v === "full") return "full";
  if (v === "am") return "am";
  if (v === "pm") return "pm";
  return null;
}

function parseTotalDays(raw: string): number | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function countWeekdays(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function computeExpectedTotal(
  startDate: string,
  endDate: string,
  durFrom: DurationToken,
  durTo: DurationToken
): { ok: true; total: number } | { ok: false; error: string } {
  if (startDate > endDate) {
    return { ok: false, error: `end date "${endDate}" is before start date "${startDate}"` };
  }
  if (startDate === endDate) {
    return { ok: true, total: durFrom === "full" ? 1 : 0.5 };
  }
  const weekdays = countWeekdays(startDate, endDate);
  if (weekdays < 2) {
    return {
      ok: false,
      error: `range ${startDate}..${endDate} has only ${weekdays} weekday(s); needs at least 2 for a multi-day leave`,
    };
  }
  const startContrib = durFrom === "full" ? 1 : 0.5;
  const endContrib = durTo === "full" ? 1 : 0.5;
  return { ok: true, total: startContrib + (weekdays - 2) + endContrib };
}

function decomposeRow(row: ParsedRow): Split[] {
  const { startDate, endDate, durationFrom, durationTo } = row;
  if (startDate === endDate) {
    if (durationFrom === "full") {
      return [{ startDate, endDate, duration: "full_day", period: null }];
    }
    return [{ startDate, endDate, duration: "half_day", period: durationFrom }];
  }
  const startIsHalf = durationFrom !== "full";
  const endIsHalf = durationTo !== "full";
  const splits: Split[] = [];

  if (!startIsHalf && !endIsHalf) {
    splits.push({ startDate, endDate, duration: "full_day", period: null });
    return splits;
  }
  if (startIsHalf) {
    splits.push({ startDate, endDate: startDate, duration: "half_day", period: durationFrom });
  }
  const midStart = startIsHalf ? addDays(startDate, 1) : startDate;
  const midEnd = endIsHalf ? addDays(endDate, -1) : endDate;
  if (midStart <= midEnd) {
    splits.push({ startDate: midStart, endDate: midEnd, duration: "full_day", period: null });
  }
  if (endIsHalf) {
    splits.push({ startDate: endDate, endDate, duration: "half_day", period: durationTo });
  }
  return splits;
}

function parseCSV(csvText: string): ParsedRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => {
    for (const n of names) {
      const idx = header.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const emailIdx = col(["email"]);
  const typeIdx = col(["leave type", "leave_type", "type"]);
  const startIdx = col(["from", "start date", "start_date"]);
  const endIdx = col(["to", "end date", "end_date"]);
  const durFromIdx = col(["duration (from)", "duration from", "from duration"]);
  const durToIdx = col(["duration (to)", "duration to", "to duration"]);
  const totalIdx = col(["leave duration", "total duration", "total days", "days"]);
  const statusIdx = col(["status", "approval status", "leave status"]);
  const reasonIdx = col(["reason", "notes"]);

  if (
    emailIdx === -1 ||
    typeIdx === -1 ||
    startIdx === -1 ||
    endIdx === -1 ||
    durFromIdx === -1 ||
    durToIdx === -1
  ) {
    return [];
  }

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    parts.push(current.trim());

    const email = parts[emailIdx] || "";
    if (!email) continue;
    if (email.toUpperCase().startsWith("OPTIONS")) continue;

    const rawType = (parts[typeIdx] || "").toLowerCase();
    const leaveType = LEAVE_TYPE_ALIASES[rawType] ?? rawType;

    const startDate = parts[startIdx] || "";
    const endDate = parts[endIdx] || startDate;

    const rawFrom = parts[durFromIdx] || "";
    const rawTo = parts[durToIdx] || "";
    const tokFrom = parseDurationToken(rawFrom);
    let durationFrom: DurationToken = "full";
    let durationTo: DurationToken = "full";
    let parseError: string | null = null;
    if (!tokFrom) {
      parseError = `invalid "duration (from)" value "${rawFrom}" (use: full / am / pm)`;
    } else if (startDate === endDate) {
      // Single-date row: duration (to) is ignored — the first column
      // describes the whole day.
      durationFrom = tokFrom;
      durationTo = tokFrom;
    } else {
      const tokTo = parseDurationToken(rawTo);
      if (!tokTo) {
        parseError = `invalid "duration (to)" value "${rawTo}" (use: full / am / pm)`;
      } else {
        durationFrom = tokFrom;
        durationTo = tokTo;
      }
    }

    const expectedTotalDays = totalIdx >= 0 ? parseTotalDays(parts[totalIdx] || "") : null;

    let statusOverride: "approved" | "pending" | undefined;
    if (statusIdx >= 0) {
      const raw = (parts[statusIdx] || "").trim().toLowerCase();
      if (raw === "") {
        // Blank cell — fall back to the import-level auto-approve toggle.
      } else if (raw === "approved") {
        statusOverride = "approved";
      } else if (raw === "pending") {
        statusOverride = "pending";
      } else if (!parseError) {
        parseError = `invalid status "${parts[statusIdx]}" (use: approved / pending, or leave blank)`;
      }
    }

    const reason = reasonIdx >= 0 ? (parts[reasonIdx] || "Bulk import") : "Bulk import";

    rows.push({
      rowNum: i + 1,
      email,
      leaveType,
      startDate,
      endDate,
      durationFrom,
      durationTo,
      expectedTotalDays,
      statusOverride,
      reason,
      ...(parseError ? { parseError } : {}),
    });
  }

  return rows;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!currentUser || !["hr_admin", "super_admin"].includes(currentUser.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const autoApprove = formData.get("auto_approve") === "true";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const csvText = await file.text();
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return Response.json(
      {
        error:
          "No valid rows found. CSV must include columns: Email, Leave Type, From, To, Duration (From), Duration (To). Optional: Leave Duration, Reason.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const results = {
    created: 0,
    skipped: 0,
    duplicates_skipped: 0,
    errors: [] as string[],
  };

  try {
    const allEmails = [...new Set(rows.map((r) => r.email))];
    const { data: users } = await admin
      .from("users")
      .select("id, email")
      .in("email", allEmails);

    const emailToId = new Map<string, string>();
    for (const u of users ?? []) {
      emailToId.set(u.email, u.id);
    }

    // Fetch existing leaves up front so dedup checks don't hit the DB
    // per CSV row. Use the set of resolvable user IDs only.
    const candidateUserIds = [...new Set(
      rows.map((r) => emailToId.get(r.email)).filter((id): id is string => !!id)
    )];
    const { data: existingLeaves } = candidateUserIds.length > 0
      ? await admin
          .from("leave_requests")
          .select("employee_id, leave_type, start_date, end_date")
          .in("employee_id", candidateUserIds)
      : { data: [] };

    const seenKeys = new Set<string>(
      (existingLeaves ?? []).map(
        (r) => `${r.employee_id}|${r.leave_type}|${r.start_date}|${r.end_date}`
      )
    );

    for (const row of rows) {
      const rowNum = row.rowNum;

      if (row.parseError) {
        results.errors.push(`Row ${rowNum}: ${row.parseError}`);
        results.skipped++;
        continue;
      }

      const userId = emailToId.get(row.email);
      if (!userId) {
        results.errors.push(`Row ${rowNum}: ${row.email} not found`);
        results.skipped++;
        continue;
      }

      if (!VALID_LEAVE_TYPES.has(row.leaveType)) {
        results.errors.push(
          `Row ${rowNum}: invalid leave type "${row.leaveType}" (use: ${[...VALID_LEAVE_TYPES].join(", ")})`
        );
        results.skipped++;
        continue;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.startDate)) {
        results.errors.push(`Row ${rowNum}: invalid start date "${row.startDate}" (use YYYY-MM-DD)`);
        results.skipped++;
        continue;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.endDate)) {
        results.errors.push(`Row ${rowNum}: invalid end date "${row.endDate}" (use YYYY-MM-DD)`);
        results.skipped++;
        continue;
      }

      const compute = computeExpectedTotal(
        row.startDate, row.endDate, row.durationFrom, row.durationTo
      );
      if (!compute.ok) {
        results.errors.push(`Row ${rowNum}: ${compute.error}`);
        results.skipped++;
        continue;
      }

      // Validate provided total against computed total (if column present).
      // Tolerance handles floating-point drift on values like 0.5+1+0.5.
      if (
        row.expectedTotalDays !== null &&
        Math.abs(row.expectedTotalDays - compute.total) > 0.001
      ) {
        results.errors.push(
          `Row ${rowNum}: "Leave Duration" column says ${row.expectedTotalDays} but durations ` +
          `(${row.durationFrom}/${row.durationTo} over ${row.startDate}..${row.endDate}) ` +
          `compute to ${compute.total}. Please recheck the source data.`
        );
        results.skipped++;
        continue;
      }

      const splits = decomposeRow(row);
      const effectiveStatus =
        row.statusOverride ?? (autoApprove ? "approved" : "pending");
      const isApproved = effectiveStatus === "approved";
      const dbInserts = splits.map((s) => ({
        employee_id: userId,
        leave_type: row.leaveType,
        start_date: s.startDate,
        end_date: s.endDate,
        leave_duration: s.duration,
        half_day_period: s.period,
        reason: row.reason,
        status: effectiveStatus,
        reviewed_by: isApproved ? authUser.id : null,
        reviewed_at: isApproved ? new Date().toISOString() : null,
      }));

      // Dedup: skip the whole CSV row if any of its splits collide with
      // an existing leave or another row we've already queued. Partial
      // duplicates are treated as full duplicates to keep semantics
      // simple — re-running an import is idempotent.
      const splitKeys = dbInserts.map(
        (i) => `${i.employee_id}|${i.leave_type}|${i.start_date}|${i.end_date}`
      );
      if (splitKeys.some((k) => seenKeys.has(k))) {
        results.duplicates_skipped++;
        continue;
      }

      // Insert all splits for this CSV row as one Postgres statement —
      // Supabase makes this atomic, so partial failure can't leave
      // orphan halves of a multi-row decomposition.
      const { error } = await admin.from("leave_requests").insert(dbInserts);
      if (error) {
        results.errors.push(`Row ${rowNum}: insert failed — ${error.message}`);
        results.skipped++;
        continue;
      }
      splitKeys.forEach((k) => seenKeys.add(k));
      results.created += dbInserts.length;
    }
  } catch (err) {
    results.errors.push(`Fatal error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return Response.json(results);
}
