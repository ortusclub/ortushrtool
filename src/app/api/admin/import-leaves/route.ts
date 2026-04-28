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

interface ParsedRow {
  email: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  duration: "full_day" | "half_day";
  halfDayPeriod: "am" | "pm" | null;
  reason: string;
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
  const startIdx = col(["start date", "start_date", "from"]);
  const endIdx = col(["end date", "end_date", "to"]);
  const durationIdx = col(["duration", "leave_duration"]);
  const reasonIdx = col(["reason", "notes"]);

  if (emailIdx === -1 || typeIdx === -1 || startIdx === -1) return [];

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

    // Skip OPTIONS row
    if (email.toUpperCase().startsWith("OPTIONS")) continue;

    const rawType = (parts[typeIdx] || "").toLowerCase();
    const leaveType = LEAVE_TYPE_ALIASES[rawType] ?? rawType;

    const startDate = parts[startIdx] || "";
    const endDate = endIdx >= 0 ? (parts[endIdx] || startDate) : startDate;

    const rawDuration = durationIdx >= 0 ? (parts[durationIdx] || "").toLowerCase() : "";
    let duration: "full_day" | "half_day" = "full_day";
    let halfDayPeriod: "am" | "pm" | null = null;
    if (rawDuration.includes("half") || rawDuration === "am" || rawDuration === "pm") {
      duration = "half_day";
      halfDayPeriod = rawDuration.includes("pm") || rawDuration === "pm" ? "pm" : "am";
    }

    const reason = reasonIdx >= 0 ? (parts[reasonIdx] || "Bulk import") : "Bulk import";

    rows.push({ email, leaveType, startDate, endDate, duration, halfDayPeriod, reason });
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
      { error: "No valid rows found. Ensure CSV has Email, Leave Type, and Start Date columns." },
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
    // Batch lookup all emails
    const allEmails = [...new Set(rows.map((r) => r.email))];
    const { data: users } = await admin
      .from("users")
      .select("id, email")
      .in("email", allEmails);

    const emailToId = new Map<string, string>();
    for (const u of users ?? []) {
      emailToId.set(u.email, u.id);
    }

    // Build leave inserts
    const inserts: Record<string, unknown>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // CSV row number (1-indexed header + 1)

      const userId = emailToId.get(row.email);
      if (!userId) {
        results.errors.push(`Row ${rowNum}: ${row.email} not found`);
        results.skipped++;
        continue;
      }

      if (!VALID_LEAVE_TYPES.has(row.leaveType)) {
        results.errors.push(`Row ${rowNum}: invalid leave type "${row.leaveType}" (use: ${[...VALID_LEAVE_TYPES].join(", ")})`);
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

      inserts.push({
        employee_id: userId,
        leave_type: row.leaveType,
        start_date: row.startDate,
        end_date: row.endDate,
        leave_duration: row.duration,
        half_day_period: row.halfDayPeriod,
        reason: row.reason,
        status: autoApprove ? "approved" : "pending",
        reviewed_by: autoApprove ? authUser.id : null,
        reviewed_at: autoApprove ? new Date().toISOString() : null,
      });
    }

    // Skip duplicates: rows that already exist for the same
    // (employee_id, leave_type, start_date, end_date) — including duplicates
    // within this CSV upload itself.
    const candidateEmployeeIds = [
      ...new Set(inserts.map((r) => r.employee_id as string)),
    ];
    const { data: existingLeaves } = await admin
      .from("leave_requests")
      .select("employee_id, leave_type, start_date, end_date")
      .in("employee_id", candidateEmployeeIds);

    const seenKeys = new Set(
      (existingLeaves ?? []).map(
        (r) =>
          `${r.employee_id}|${r.leave_type}|${r.start_date}|${r.end_date}`
      )
    );

    const dedupedInserts: Record<string, unknown>[] = [];
    for (const ins of inserts) {
      const key = `${ins.employee_id}|${ins.leave_type}|${ins.start_date}|${ins.end_date}`;
      if (seenKeys.has(key)) {
        results.duplicates_skipped++;
        continue;
      }
      seenKeys.add(key);
      dedupedInserts.push(ins);
    }

    // Batch insert in chunks of 50
    for (let i = 0; i < dedupedInserts.length; i += 50) {
      const batch = dedupedInserts.slice(i, i + 50);
      const { error } = await admin.from("leave_requests").insert(batch);
      if (error) {
        results.errors.push(`Insert error: ${error.message}`);
      } else {
        results.created += batch.length;
      }
    }
  } catch (err) {
    results.errors.push(`Fatal error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return Response.json(results);
}
