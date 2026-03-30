import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TIMEZONE_MAP: Record<string, string> = {
  PHT: "Asia/Manila",
  CET: "Europe/Berlin",
  GST: "Asia/Dubai",
};

interface ParsedRow {
  name: string;
  email: string;
  timezone: string;
  days: { location: string; start: string; end: string }[];
  managerName: string;
}

function parseScheduleCell(cell: string) {
  const match = cell
    .trim()
    .match(/^(Online|Office)\s*-\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i);
  if (!match) return { location: "office", start: "09:00", end: "18:00" };
  return { location: match[1].toLowerCase(), start: match[2], end: match[3] };
}

function parseCSV(csvText: string): ParsedRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 8) continue;

    const name = parts[0].trim();
    const email = parts[1].trim();
    const tz = parts[2].trim();
    const days = [
      parseScheduleCell(parts[3]),
      parseScheduleCell(parts[4]),
      parseScheduleCell(parts[5]),
      parseScheduleCell(parts[6]),
      parseScheduleCell(parts[7]),
    ];
    const managerName = parts[8]?.trim() ?? "";

    if (!email) continue;
    rows.push({
      name,
      email,
      timezone: TIMEZONE_MAP[tz] ?? "Asia/Manila",
      days,
      managerName,
    });
  }
  return rows;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-schedules.ts <csv-path>");
    process.exit(1);
  }

  const csvText = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csvText);
  console.log(`Parsed ${rows.length} rows from CSV`);

  const today = new Date().toISOString().split("T")[0];
  const emailToId = new Map<string, string>();
  let created = 0;
  let updated = 0;

  // Pass 1: Create/update users
  for (const row of rows) {
    // Check if user exists in public.users
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", row.email)
      .maybeSingle();

    if (existing) {
      emailToId.set(row.email, existing.id);
      await supabase
        .from("users")
        .update({ full_name: row.name, timezone: row.timezone })
        .eq("id", existing.id);
      updated++;
      console.log(`  Updated: ${row.name} (${row.email})`);
    } else {
      // Create auth user
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: row.email,
          email_confirm: true,
          user_metadata: { full_name: row.name },
        });

      if (authError) {
        // Maybe exists in auth but not public.users
        const { data: listData } = await supabase.auth.admin.listUsers();
        const found = listData?.users?.find((u) => u.email === row.email);
        if (found) {
          emailToId.set(row.email, found.id);
          await supabase.from("users").upsert({
            id: found.id,
            email: row.email,
            full_name: row.name,
            timezone: row.timezone,
          });
          updated++;
          console.log(`  Recovered: ${row.name} (${row.email})`);
        } else {
          console.error(`  FAILED: ${row.email} - ${authError.message}`);
        }
        continue;
      }

      if (authData.user) {
        emailToId.set(row.email, authData.user.id);
        // Wait for trigger to create public.users row
        await new Promise((r) => setTimeout(r, 200));
        await supabase
          .from("users")
          .update({ full_name: row.name, timezone: row.timezone })
          .eq("id", authData.user.id);
        created++;
        console.log(`  Created: ${row.name} (${row.email})`);
      }
    }
  }

  console.log(`\nUsers: ${created} created, ${updated} updated`);

  // Pass 2: Link managers
  let managersLinked = 0;

  // Build name lookup maps
  const nameToRow = new Map<string, ParsedRow>();
  for (const row of rows) {
    nameToRow.set(row.name, row);
  }

  for (const row of rows) {
    if (!row.managerName) continue;
    const userId = emailToId.get(row.email);
    if (!userId) continue;

    let managerId: string | undefined;

    // "Sam and Jess" -> assign to Sam (sam@ortusclub.com)
    if (row.managerName === "Sam and Jess") {
      managerId = emailToId.get("sam@ortusclub.com");
    } else {
      // Try exact name match from CSV rows
      const managerRow = nameToRow.get(row.managerName);
      if (managerRow) {
        managerId = emailToId.get(managerRow.email);
      }

      // Try first name match
      if (!managerId) {
        const firstName = row.managerName.split(" ")[0];
        const match = rows.find((r) => r.name === firstName);
        if (match) {
          managerId = emailToId.get(match.email);
        }
      }

      // Try searching by full_name in DB
      if (!managerId) {
        const { data: managerUser } = await supabase
          .from("users")
          .select("id")
          .ilike("full_name", `%${row.managerName}%`)
          .limit(1)
          .maybeSingle();
        if (managerUser) managerId = managerUser.id;
      }
    }

    if (managerId && managerId !== userId) {
      await supabase
        .from("users")
        .update({ manager_id: managerId })
        .eq("id", userId);
      managersLinked++;
    } else if (!managerId) {
      console.warn(`  Manager not found for ${row.name}: "${row.managerName}"`);
    }
  }

  console.log(`Managers linked: ${managersLinked}`);

  // Pass 3: Create schedules
  let schedulesCreated = 0;

  for (const row of rows) {
    const userId = emailToId.get(row.email);
    if (!userId) continue;

    // Delete existing schedules
    await supabase.from("schedules").delete().eq("employee_id", userId);

    // Mon-Fri
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const day = row.days[dayIdx];
      const { error } = await supabase.from("schedules").insert({
        employee_id: userId,
        day_of_week: dayIdx,
        start_time: day.start,
        end_time: day.end,
        is_rest_day: false,
        work_location: day.location as "office" | "online",
        effective_from: today,
      });
      if (error) {
        console.error(`  Schedule error ${row.email} day ${dayIdx}: ${error.message}`);
      } else {
        schedulesCreated++;
      }
    }

    // Sat & Sun as rest days
    for (const dayIdx of [5, 6]) {
      await supabase.from("schedules").insert({
        employee_id: userId,
        day_of_week: dayIdx,
        start_time: "00:00",
        end_time: "00:00",
        is_rest_day: true,
        work_location: "office",
        effective_from: today,
      });
      schedulesCreated++;
    }
  }

  console.log(`Schedules created: ${schedulesCreated}`);

  // Make sure Sam stays super_admin
  const samId = emailToId.get("sam@ortusclub.com");
  if (samId) {
    await supabase
      .from("users")
      .update({ role: "super_admin" })
      .eq("id", samId);
    console.log("\nSam set back to super_admin");
  }

  console.log("\nDone!");
}

main().catch(console.error);
