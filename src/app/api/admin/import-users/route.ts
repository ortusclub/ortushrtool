import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TIMEZONE_MAP: Record<string, string> = {
  PHT: "Asia/Manila",
  CET: "Europe/Berlin",
  GST: "Asia/Dubai",
};

const COUNTRY_MAP: Record<string, string> = {
  PH: "PH",
  PHILIPPINES: "PH",
  XK: "XK",
  KOSOVO: "XK",
  IT: "IT",
  ITALY: "IT",
  AE: "AE",
  UAE: "AE",
  DUBAI: "AE",
};

interface ParsedUserRow {
  name: string;
  email: string;
  timezone: string;
  department: string;
  managerName: string;
  holidayCountry: string;
  desktimeId: number | null;
}

function parseCSV(csvText: string): ParsedUserRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header to find columns
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const nameIdx = Math.max(col("name"), col("person"), col("full_name"));
  const emailIdx = col("email");

  if (nameIdx === -1 || emailIdx === -1) return [];

  const tzIdx = Math.max(col("timezone"), col("time zone"), col("tz"));
  const deptIdx = Math.max(col("department"), col("dept"));
  const managerIdx = Math.max(col("manager"), col("manager name"), col("manager_name"));
  const countryIdx = Math.max(col("holiday_country"), col("holiday country"), col("country"));
  const desktimeIdx = Math.max(col("desktime_id"), col("desktime id"), col("desktime_employee_id"), col("desktime"));

  const rows: ParsedUserRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    const email = parts[emailIdx] || "";
    if (!email) continue;

    const tz = tzIdx >= 0 ? parts[tzIdx] || "" : "";
    const country = countryIdx >= 0 ? (parts[countryIdx] || "").toUpperCase() : "";
    const desktimeRaw = desktimeIdx >= 0 ? parts[desktimeIdx] : "";

    rows.push({
      name: parts[nameIdx] || "",
      email,
      timezone: TIMEZONE_MAP[tz] ?? (tz || "Asia/Manila"),
      department: deptIdx >= 0 ? parts[deptIdx] || "" : "",
      managerName: managerIdx >= 0 ? parts[managerIdx] || "" : "",
      holidayCountry: COUNTRY_MAP[country] ?? "PH",
      desktimeId: desktimeRaw ? parseInt(desktimeRaw, 10) || null : null,
    });
  }

  return rows;
}

export async function POST(request: Request) {
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

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found. Ensure CSV has Name and Email columns." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const total = rows.length;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      const results = {
        usersCreated: 0,
        usersUpdated: 0,
        managersLinked: 0,
        errors: [] as string[],
      };

      // First pass: create/update users
      const emailToId = new Map<string, string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        send({ type: "progress", phase: "users", current: i + 1, total, message: `Processing ${row.name || row.email}` });

        try {
          const { data: existingUser } = await admin
            .from("users")
            .select("id")
            .eq("email", row.email)
            .maybeSingle();

          const updateFields: Record<string, unknown> = {
            full_name: row.name,
            timezone: row.timezone,
          };
          if (row.department) updateFields.department = row.department;
          if (row.holidayCountry) updateFields.holiday_country = row.holidayCountry;
          if (row.desktimeId) updateFields.desktime_employee_id = row.desktimeId;

          if (existingUser) {
            emailToId.set(row.email, existingUser.id);
            await admin.from("users").update(updateFields).eq("id", existingUser.id);
            results.usersUpdated++;
          } else {
            const { data: authData, error: authError } =
              await admin.auth.admin.createUser({
                email: row.email,
                email_confirm: true,
                user_metadata: { full_name: row.name },
              });

            if (authError) {
              const { data: existingAuth } = await admin.auth.admin.listUsers();
              const found = existingAuth?.users?.find((u) => u.email === row.email);
              if (found) {
                emailToId.set(row.email, found.id);
                await admin.from("users").upsert({ id: found.id, email: row.email, ...updateFields });
                results.usersUpdated++;
              } else {
                results.errors.push(`Failed to create ${row.email}: ${authError.message}`);
              }
              continue;
            }

            if (authData.user) {
              emailToId.set(row.email, authData.user.id);
              await new Promise((r) => setTimeout(r, 100));
              await admin.from("users").update(updateFields).eq("id", authData.user.id);
              results.usersCreated++;
            }
          }
        } catch (err) {
          results.errors.push(`Error processing ${row.email}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }

      // Second pass: link managers
      const managerRows = rows.filter((r) => r.managerName);
      for (let i = 0; i < managerRows.length; i++) {
        const row = managerRows[i];
        send({ type: "progress", phase: "managers", current: i + 1, total: managerRows.length, message: `Linking manager for ${row.name || row.email}` });

        const userId = emailToId.get(row.email);
        if (!userId) continue;

        let managerEmail: string | undefined;

        for (const r of rows) {
          if (r.name === row.managerName) {
            managerEmail = r.email;
            break;
          }
        }

        if (!managerEmail) {
          const firstName = row.managerName.split(" ")[0];
          for (const r of rows) {
            if (r.name === firstName) {
              managerEmail = r.email;
              break;
            }
          }
        }

        if (!managerEmail) {
          const { data: managerUser } = await admin
            .from("users")
            .select("id")
            .ilike("full_name", `%${row.managerName}%`)
            .limit(1)
            .maybeSingle();

          if (managerUser) {
            await admin.from("users").update({ manager_id: managerUser.id }).eq("id", userId);
            results.managersLinked++;
            continue;
          }
        }

        if (managerEmail) {
          const managerId = emailToId.get(managerEmail);
          if (managerId && managerId !== userId) {
            await admin.from("users").update({ manager_id: managerId }).eq("id", userId);
            results.managersLinked++;
          }
        }
      }

      send({ type: "done", ...results });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
