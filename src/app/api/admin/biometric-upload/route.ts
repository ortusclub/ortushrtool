import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";

export const maxDuration = 60;

interface ParsedRow {
  biometric_id: number;
  name: string;
  punch_time: string; // ISO string in Asia/Manila offset
}

interface RequestBody {
  rows?: ParsedRow[];
  source_filename?: string | null;
}

type RowError = {
  biometric_id: number;
  name: string;
  punch_time: string;
  reason: string;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!caller || !hasRole(caller.role, "hr_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch every user referenced by the upload, so we can match + name-check
  // in a single pass.
  const biometricIds = [...new Set(rows.map((r) => r.biometric_id).filter((n) => Number.isFinite(n)))];
  const { data: matchedUsers } = await admin
    .from("users")
    .select("id, biometric_id, preferred_name, first_name, full_name")
    .in("biometric_id", biometricIds);

  const userByBiometricId = new Map<number, {
    id: string;
    biometric_id: number;
    preferred_name: string | null;
    first_name: string | null;
    full_name: string | null;
  }>();
  for (const u of matchedUsers ?? []) {
    if (u.biometric_id != null) userByBiometricId.set(u.biometric_id, u);
  }

  const errors: RowError[] = [];
  const toInsert: {
    employee_id: string;
    punch_time: string;
    source_filename: string | null;
    uploaded_by: string;
  }[] = [];

  for (const row of rows) {
    if (!Number.isFinite(row.biometric_id)) {
      errors.push({
        biometric_id: row.biometric_id,
        name: row.name,
        punch_time: row.punch_time,
        reason: "Invalid biometric_id",
      });
      continue;
    }
    const matched = userByBiometricId.get(row.biometric_id);
    if (!matched) {
      errors.push({
        biometric_id: row.biometric_id,
        name: row.name,
        punch_time: row.punch_time,
        reason: "No user with this biometric_id",
      });
      continue;
    }
    const csvName = normalizeName(row.name);
    // Name in the CSV is treated as preferred name; accept full_name as a
    // fallback so admins who only set full_name aren't blocked.
    const candidates = [matched.preferred_name, matched.first_name, matched.full_name]
      .filter((s): s is string => Boolean(s))
      .map(normalizeName);
    if (csvName && !candidates.includes(csvName)) {
      errors.push({
        biometric_id: row.biometric_id,
        name: row.name,
        punch_time: row.punch_time,
        reason: `Name mismatch (profile: ${matched.preferred_name ?? matched.full_name ?? "—"})`,
      });
      continue;
    }
    toInsert.push({
      employee_id: matched.id,
      punch_time: row.punch_time,
      source_filename: body.source_filename ?? null,
      uploaded_by: user.id,
    });
  }

  let inserted = 0;
  let skipped = 0;
  if (toInsert.length > 0) {
    // Upsert with ignoreDuplicates so re-running the same CSV is safe.
    const { error, count } = await admin
      .from("biometric_punches")
      .upsert(toInsert, {
        onConflict: "employee_id,punch_time",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted = count ?? 0;
    skipped = toInsert.length - inserted;
  }

  return NextResponse.json({
    ok: true,
    received: rows.length,
    inserted,
    skipped_duplicates: skipped,
    errors,
  });
}
