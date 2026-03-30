import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Map CSV timezone abbreviations to IANA timezones
const TIMEZONE_MAP: Record<string, string> = {
  PHT: "Asia/Manila",
  CET: "Europe/Berlin",
  GST: "Asia/Dubai",
};

// Map CSV day columns to day_of_week (Monday=0)
const DAY_INDICES = [0, 1, 2, 3, 4]; // M, T, W, TH, F

interface ParsedRow {
  name: string;
  email: string;
  timezone: string;
  days: { location: string; start: string; end: string }[];
  managerName: string;
}

function parseScheduleCell(cell: string): {
  location: string;
  start: string;
  end: string;
} {
  // Format: "Online - 10:00 - 19:00" or "Office - 09:00 - 18:00"
  const match = cell.trim().match(/^(Online|Office)\s*-\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i);
  if (!match) {
    return { location: "office", start: "09:00", end: "18:00" };
  }
  return {
    location: match[1].toLowerCase(),
    start: match[2],
    end: match[3],
  };
}

function parseCSV(csvText: string): ParsedRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  // Skip header
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

export async function POST(request: Request) {
  // Auth check — must be HR admin or super admin
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!currentUser || !["hr_admin", "super_admin"].includes(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const csvText = await file.text();
  const rows = parseCSV(csvText);

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const results = {
    usersCreated: 0,
    usersUpdated: 0,
    schedulesCreated: 0,
    managersLinked: 0,
    errors: [] as string[],
  };

  // First pass: create/update all users
  const emailToId = new Map<string, string>();

  for (const row of rows) {
    try {
      // Check if user already exists in public.users
      const { data: existingUser } = await admin
        .from("users")
        .select("id")
        .eq("email", row.email)
        .maybeSingle();

      if (existingUser) {
        emailToId.set(row.email, existingUser.id);
        // Update timezone
        await admin
          .from("users")
          .update({ timezone: row.timezone, full_name: row.name })
          .eq("id", existingUser.id);
        results.usersUpdated++;
      } else {
        // Create auth user (password won't be used — they'll use Google SSO)
        const { data: authData, error: authError } =
          await admin.auth.admin.createUser({
            email: row.email,
            email_confirm: true,
            user_metadata: { full_name: row.name },
          });

        if (authError) {
          // User might exist in auth but not in public.users
          const { data: existingAuth } =
            await admin.auth.admin.listUsers();
          const found = existingAuth?.users?.find(
            (u) => u.email === row.email
          );
          if (found) {
            emailToId.set(row.email, found.id);
            // Ensure public.users entry exists
            await admin.from("users").upsert({
              id: found.id,
              email: row.email,
              full_name: row.name,
              timezone: row.timezone,
            });
            results.usersUpdated++;
          } else {
            results.errors.push(`Failed to create user ${row.email}: ${authError.message}`);
          }
          continue;
        }

        if (authData.user) {
          emailToId.set(row.email, authData.user.id);
          // The trigger should create the public.users row, but update timezone
          // Wait briefly for trigger
          await new Promise((r) => setTimeout(r, 100));
          await admin
            .from("users")
            .update({ timezone: row.timezone, full_name: row.name })
            .eq("id", authData.user.id);
          results.usersCreated++;
        }
      }
    } catch (err) {
      results.errors.push(
        `Error processing ${row.email}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  // Second pass: link managers
  // Build a name-to-email map from the CSV
  const nameToEmail = new Map<string, string>();
  for (const row of rows) {
    nameToEmail.set(row.name, row.email);
    // Also try full name matching
    nameToEmail.set(row.name.toLowerCase(), row.email);
  }

  for (const row of rows) {
    if (!row.managerName) continue;

    const userId = emailToId.get(row.email);
    if (!userId) continue;

    // Try to find manager by name in our user list
    // Manager names in CSV may be full names like "Alecx Bagatsolon"
    // But our CSV names are short names like "Alecx"
    // Try matching by first name or full manager name
    let managerEmail: string | undefined;

    // Check if the manager name matches any row's name exactly
    for (const r of rows) {
      if (r.name === row.managerName) {
        managerEmail = r.email;
        break;
      }
    }

    // If not found, try matching the first part of the manager name
    if (!managerEmail) {
      const firstName = row.managerName.split(" ")[0];
      for (const r of rows) {
        if (r.name === firstName) {
          managerEmail = r.email;
          break;
        }
      }
    }

    // Try matching full name from public.users
    if (!managerEmail) {
      const { data: managerUser } = await admin
        .from("users")
        .select("id")
        .ilike("full_name", `%${row.managerName}%`)
        .limit(1)
        .maybeSingle();

      if (managerUser) {
        await admin
          .from("users")
          .update({ manager_id: managerUser.id })
          .eq("id", userId);
        results.managersLinked++;
        continue;
      }
    }

    if (managerEmail) {
      const managerId = emailToId.get(managerEmail);
      if (managerId && managerId !== userId) {
        await admin
          .from("users")
          .update({ manager_id: managerId })
          .eq("id", userId);
        results.managersLinked++;
      }
    }
  }

  // Third pass: create schedules
  for (const row of rows) {
    const userId = emailToId.get(row.email);
    if (!userId) continue;

    // Delete existing schedules for this user (replace with fresh data)
    await admin
      .from("schedules")
      .delete()
      .eq("employee_id", userId);

    // Create Mon-Fri schedules
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const day = row.days[dayIdx];
      await admin.from("schedules").insert({
        employee_id: userId,
        day_of_week: dayIdx, // 0=Monday
        start_time: day.start,
        end_time: day.end,
        is_rest_day: false,
        work_location: day.location as "office" | "online",
        effective_from: today,
      });
      results.schedulesCreated++;
    }

    // Create Saturday (5) and Sunday (6) as rest days
    for (const dayIdx of [5, 6]) {
      await admin.from("schedules").insert({
        employee_id: userId,
        day_of_week: dayIdx,
        start_time: "00:00",
        end_time: "00:00",
        is_rest_day: true,
        work_location: "office",
        effective_from: today,
      });
      results.schedulesCreated++;
    }
  }

  return NextResponse.json(results);
}
