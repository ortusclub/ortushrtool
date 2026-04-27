import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const TIMEZONE_MAP: Record<string, string> = {
  PHT: "Asia/Manila",
  CET: "Europe/Berlin",
  GST: "Asia/Dubai",
};

const COUNTRY_MAP: Record<string, string> = {
  PH: "PH", PHILIPPINES: "PH",
  XK: "XK", KOSOVO: "XK",
  IT: "IT", ITALY: "IT",
  AE: "AE", UAE: "AE", DUBAI: "AE",
};

const ROLE_MAP: Record<string, string> = {
  EMPLOYEE: "employee",
  MANAGER: "manager",
  HR_ADMIN: "hr_admin",
  "HR ADMIN": "hr_admin",
  SUPER_ADMIN: "super_admin",
  "SUPER ADMIN": "super_admin",
};

interface ParsedRow {
  name: string;
  email: string;
  timezone: string;
  role: string;
  department: string;
  managerName: string;
  holidayCountry: string;
  desktimeId: number | null;
  birthday: string;
  hireDate: string;
  endDate: string;
  isActive: boolean | null;
  days: ({ location: string; start: string; end: string } | "rest" | null)[];
}

function parseScheduleCell(cell: string): { location: string; start: string; end: string } | "rest" | null {
  if (!cell || !cell.trim()) return null;
  if (cell.trim().toLowerCase() === "rest") return "rest";
  const match = cell.trim().match(/^(Online|Office)\s*-\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i);
  if (!match) return null;
  return { location: match[1].toLowerCase(), start: match[2], end: match[3] };
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

  const nameIdx = col(["name", "person", "full_name"]);
  const emailIdx = col(["email"]);
  if (nameIdx === -1 || emailIdx === -1) return [];

  const tzIdx = col(["timezone", "time zone", "tz"]);
  const roleIdx = col(["role"]);
  const deptIdx = col(["department", "dept"]);
  const managerIdx = col(["manager", "manager name", "manager_name"]);
  const countryIdx = col(["country", "holiday_country", "holiday country"]);
  const desktimeIdx = col(["desktime_id", "desktime id", "desktime_employee_id", "desktime"]);
  const birthdayIdx = col(["birthday", "date_of_birth", "dob"]);
  const hireDateIdx = col(["hire_date", "hire date", "start_date", "start date"]);
  const endDateIdx = col(["end_date", "end date"]);
  const activeIdx = col(["active", "is_active"]);
  const mIdx = col(["m", "monday"]);
  const tIdx = col(["t", "tuesday"]);
  const wIdx = col(["w", "wednesday"]);
  const thIdx = col(["th", "thursday"]);
  const fIdx = col(["f", "friday"]);

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Split by comma but respect quoted values
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

    const tz = tzIdx >= 0 ? parts[tzIdx] || "" : "";
    const roleRaw = roleIdx >= 0 ? (parts[roleIdx] || "").toUpperCase() : "";
    const country = countryIdx >= 0 ? (parts[countryIdx] || "").toUpperCase() : "";
    const desktimeRaw = desktimeIdx >= 0 ? parts[desktimeIdx] : "";
    const birthdayRaw = birthdayIdx >= 0 ? parts[birthdayIdx] || "" : "";
    const hireDateRaw = hireDateIdx >= 0 ? parts[hireDateIdx] || "" : "";
    const endDateRaw = endDateIdx >= 0 ? parts[endDateIdx] || "" : "";
    const activeRaw = activeIdx >= 0 ? parts[activeIdx] || "" : "";

    const days = [mIdx, tIdx, wIdx, thIdx, fIdx].map(
      (idx) => idx >= 0 ? parseScheduleCell(parts[idx] || "") : null
    );

    let isActive: boolean | null = null;
    if (activeRaw) {
      isActive = ["yes", "true", "1"].includes(activeRaw.toLowerCase());
    }

    rows.push({
      name: parts[nameIdx] || "",
      email,
      timezone: tz ? (TIMEZONE_MAP[tz] ?? tz) : "",
      role: ROLE_MAP[roleRaw] ?? (roleRaw ? roleRaw.toLowerCase() : ""),
      department: deptIdx >= 0 ? parts[deptIdx] || "" : "",
      managerName: managerIdx >= 0 ? parts[managerIdx] || "" : "",
      holidayCountry: country ? (COUNTRY_MAP[country] ?? country) : "",
      desktimeId: desktimeRaw ? parseInt(desktimeRaw, 10) || null : null,
      birthday: birthdayRaw,
      hireDate: hireDateRaw,
      endDate: endDateRaw,
      isActive,
      days,
    });
  }

  return rows;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!currentUser || !["hr_admin", "super_admin"].includes(currentUser.role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
  }

  const csvText = await file.text();
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ error: "No valid rows found. Ensure CSV has at least Name and Email columns." }),
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const validRoles = new Set(["employee", "manager", "hr_admin", "super_admin"]);
  const hasSchedules = rows.some((r) => r.days.some((d) => d !== null && d !== undefined));

  const results = {
    usersCreated: 0,
    usersUpdated: 0,
    schedulesCreated: 0,
    managersLinked: 0,
    errors: [] as string[],
  };

  try {
    const emailToId = new Map<string, string>();

    // Batch fetch all existing users in one query
    const allEmails = rows.map((r) => r.email);
    const { data: existingUsers } = await admin
      .from("users")
      .select("id, email")
      .in("email", allEmails);

    for (const u of existingUsers ?? []) {
      emailToId.set(u.email, u.id);
    }

    // Process users in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (row) => {
        try {
          const updateFields: Record<string, unknown> = {};
          if (row.name) updateFields.full_name = row.name;
          if (row.timezone) updateFields.timezone = row.timezone;
          if (row.role) {
            if (validRoles.has(row.role)) {
              updateFields.role = row.role;
            } else {
              results.errors.push(`${row.email}: invalid role "${row.role}" (must be employee, manager, hr_admin, or super_admin)`);
            }
          }
          if (row.department) updateFields.department = row.department;
          if (row.holidayCountry) updateFields.holiday_country = row.holidayCountry;
          if (row.desktimeId) updateFields.desktime_employee_id = row.desktimeId;
          if (row.birthday) updateFields.birthday = row.birthday;
          if (row.hireDate) updateFields.hire_date = row.hireDate;
          if (row.endDate) updateFields.end_date = row.endDate;
          if (row.isActive !== null) updateFields.is_active = row.isActive;

          const existingId = emailToId.get(row.email);

          if (existingId) {
            await admin.from("users").update(updateFields).eq("id", existingId);
            results.usersUpdated++;
          } else {
            const { data: authData, error: authError } =
              await admin.auth.admin.createUser({
                email: row.email,
                email_confirm: true,
                user_metadata: { full_name: row.name },
              });

            if (authError) {
              // Try to find in auth and upsert
              const { data: existingAuth } = await admin.auth.admin.listUsers();
              const found = existingAuth?.users?.find((u) => u.email === row.email);
              if (found) {
                emailToId.set(row.email, found.id);
                await admin.from("users").upsert({ id: found.id, email: row.email, ...updateFields });
                results.usersUpdated++;
              } else {
                results.errors.push(`Failed to create ${row.email}: ${authError.message}`);
              }
              return;
            }

            if (authData.user) {
              emailToId.set(row.email, authData.user.id);
              await admin.from("users").update(updateFields).eq("id", authData.user.id);
              results.usersCreated++;
            }
          }
        } catch (err) {
          results.errors.push(`Error processing ${row.email}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }));
    }

    // Batch fetch all users for manager linking (one query)
    const { data: allUsers } = await admin
      .from("users")
      .select("id, full_name, email");

    const nameToId = new Map<string, string>();
    for (const u of allUsers ?? []) {
      if (u.full_name) nameToId.set(u.full_name, u.id);
      emailToId.set(u.email, u.id);
    }

    // Link managers in parallel batches
    const managerUpdates: { userId: string; managerId: string }[] = [];
    for (const row of rows) {
      if (!row.managerName) continue;
      const userId = emailToId.get(row.email);
      if (!userId) continue;

      // Try exact name match first (from CSV or DB)
      let managerId = nameToId.get(row.managerName);

      // Try partial match
      if (!managerId) {
        for (const u of allUsers ?? []) {
          if (u.full_name && u.full_name.toLowerCase().includes(row.managerName.toLowerCase())) {
            managerId = u.id;
            break;
          }
        }
      }

      if (managerId && managerId !== userId) {
        managerUpdates.push({ userId, managerId });
      }
    }

    // Batch manager updates
    for (let i = 0; i < managerUpdates.length; i += BATCH_SIZE) {
      const batch = managerUpdates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(({ userId, managerId }) =>
        admin.from("users").update({ manager_id: managerId }).eq("id", userId)
      ));
      results.managersLinked += batch.length;
    }

    // Batch create schedules
    if (hasSchedules) {
      const userIdsWithSchedules: string[] = [];
      const scheduleRows: {
        employee_id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
        is_rest_day: boolean;
        work_location: string;
        effective_from: string;
      }[] = [];

      for (const row of rows) {
        const hasAnySchedule = row.days.some((d) => d !== null && d !== undefined);
        if (!hasAnySchedule) continue;

        const userId = emailToId.get(row.email);
        if (!userId) continue;

        userIdsWithSchedules.push(userId);

        for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
          const day = row.days[dayIdx];
          const isRest = day === "rest";
          const hasTime = day !== null && day !== "rest";
          scheduleRows.push({
            employee_id: userId,
            day_of_week: dayIdx,
            start_time: hasTime ? day.start : "00:00",
            end_time: hasTime ? day.end : "00:00",
            is_rest_day: isRest,
            work_location: hasTime ? day.location : "office",
            effective_from: today,
          });
        }

        // Weekend rest days
        for (const dayIdx of [5, 6]) {
          scheduleRows.push({
            employee_id: userId,
            day_of_week: dayIdx,
            start_time: "00:00",
            end_time: "00:00",
            is_rest_day: true,
            work_location: "office",
            effective_from: today,
          });
        }
      }

      // Delete existing schedules in one batch
      if (userIdsWithSchedules.length > 0) {
        await admin.from("schedules").delete().in("employee_id", userIdsWithSchedules);
      }

      // Insert all schedules in batches of 100
      for (let i = 0; i < scheduleRows.length; i += 100) {
        const batch = scheduleRows.slice(i, i + 100);
        await admin.from("schedules").insert(batch);
      }
      results.schedulesCreated = scheduleRows.length;
    }
  } catch (err) {
    results.errors.push(`Fatal error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return Response.json(results);
}
