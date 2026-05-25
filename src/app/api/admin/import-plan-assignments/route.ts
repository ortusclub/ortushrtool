import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

interface ParsedRow {
  rowNum: number;
  email: string;
  planName: string;
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
  const planIdx = col(["plan", "plan_name", "leave_plan"]);

  if (emailIdx === -1 || planIdx === -1) return [];

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

    const email = (parts[emailIdx] || "").toLowerCase();
    if (!email) continue;
    // Sample download includes a HINT: row right under the header; the
    // parser ignores it so the sample can be re-uploaded as-is.
    if (email.startsWith("hint")) continue;

    rows.push({
      rowNum: i + 1,
      email,
      planName: (parts[planIdx] || "").toLowerCase(),
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

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const csvText = await file.text();
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return Response.json(
      { error: "No valid rows found. CSV must include columns: email, plan." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const results = {
    assigned: 0,
    skipped: 0,
    duplicates_skipped: 0,
    errors: [] as string[],
  };

  try {
    const allEmails = [...new Set(rows.map((r) => r.email))];

    const [{ data: users }, { data: plans }] = await Promise.all([
      admin.from("users").select("id, email").in("email", allEmails),
      admin.from("leave_plans").select("id, name"),
    ]);

    const emailToId = new Map<string, string>();
    for (const u of users ?? []) emailToId.set(u.email.toLowerCase(), u.id);

    const planNameToId = new Map<string, string>();
    for (const p of plans ?? []) planNameToId.set(p.name.toLowerCase(), p.id);

    const candidateUserIds = [...new Set(
      rows.map((r) => emailToId.get(r.email)).filter((id): id is string => !!id)
    )];

    const { data: existing } = candidateUserIds.length > 0
      ? await admin
          .from("employee_leave_plans")
          .select("employee_id, plan_id")
          .in("employee_id", candidateUserIds)
      : { data: [] };

    const seenKeys = new Set<string>(
      (existing ?? []).map((e) => `${e.employee_id}|${e.plan_id}`)
    );

    type InsertTask = {
      rowNum: number;
      insert: Record<string, unknown>;
    };
    const tasks: InsertTask[] = [];

    for (const row of rows) {
      const userId = emailToId.get(row.email);
      if (!userId) {
        results.errors.push(`Row ${row.rowNum}: ${row.email} not found`);
        results.skipped++;
        continue;
      }

      if (!row.planName) {
        results.errors.push(`Row ${row.rowNum}: missing plan name`);
        results.skipped++;
        continue;
      }

      const planId = planNameToId.get(row.planName);
      if (!planId) {
        results.errors.push(`Row ${row.rowNum}: plan "${row.planName}" not found`);
        results.skipped++;
        continue;
      }

      const key = `${userId}|${planId}`;
      if (seenKeys.has(key)) {
        results.duplicates_skipped++;
        continue;
      }
      seenKeys.add(key);

      tasks.push({
        rowNum: row.rowNum,
        insert: {
          employee_id: userId,
          plan_id: planId,
          assigned_by: authUser.id,
        },
      });
    }

    const CONCURRENCY = 10;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const chunk = tasks.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async ({ rowNum, insert }) => {
          const { error } = await admin
            .from("employee_leave_plans")
            .insert(insert);
          if (error) {
            results.errors.push(`Row ${rowNum}: insert failed — ${error.message}`);
            results.skipped++;
          } else {
            results.assigned++;
          }
        })
      );
    }
  } catch (err) {
    results.errors.push(`Fatal error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return Response.json(results);
}
