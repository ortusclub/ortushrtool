import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedPunch } from "./parse";

/**
 * The single place punches become rows, shared by all three entry points:
 * the HR upload page, the machine-callable CSV ingest, and the device's live
 * ADMS feed. They differ only in how bytes are parsed and who is allowed to
 * call them — matching and persistence are identical.
 */

export type IngestRowError = {
  biometric_id: number;
  name: string | null;
  punch_time: string;
  reason: string;
};

export type IngestResult = {
  received: number;
  inserted: number;
  skipped_duplicates: number;
  errors: IngestRowError[];
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function ingestPunches(
  admin: SupabaseClient,
  rows: ParsedPunch[],
  opts: {
    sourceFilename?: string | null;
    uploadedBy?: string | null;
    /**
     * Whether a name in the source must match the user's profile. The export
     * file carries names worth cross-checking; ADMS posts carry only a PIN,
     * so there's nothing to check and this is off for them.
     */
    checkNames?: boolean;
  } = {}
): Promise<IngestResult> {
  const { sourceFilename = null, uploadedBy = null, checkNames = true } = opts;

  const biometricIds = [
    ...new Set(rows.map((r) => r.biometric_id).filter((n) => Number.isFinite(n))),
  ];
  const { data: matchedUsers } = biometricIds.length
    ? await admin
        .from("users")
        .select("id, biometric_id, preferred_name, first_name, full_name")
        .in("biometric_id", biometricIds)
    : { data: [] };

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

  const errors: IngestRowError[] = [];
  const toInsert: {
    employee_id: string;
    punch_time: string;
    source_filename: string | null;
    uploaded_by: string | null;
  }[] = [];

  for (const row of rows) {
    if (!Number.isFinite(row.biometric_id)) {
      errors.push({ ...row, reason: "Invalid biometric_id" });
      continue;
    }
    const matched = userByBiometricId.get(row.biometric_id);
    if (!matched) {
      errors.push({ ...row, reason: "No user with this biometric_id" });
      continue;
    }
    if (checkNames && row.name) {
      const csvName = normalizeName(row.name);
      // The source's name is treated as a preferred name; first/full name are
      // accepted as fallbacks so a profile with only full_name isn't blocked.
      const candidates = [matched.preferred_name, matched.first_name, matched.full_name]
        .filter((s): s is string => Boolean(s))
        .map(normalizeName);
      if (!candidates.includes(csvName)) {
        errors.push({
          ...row,
          reason: `Name mismatch (profile: ${matched.preferred_name ?? matched.full_name ?? "—"})`,
        });
        continue;
      }
    }
    toInsert.push({
      employee_id: matched.id,
      punch_time: row.punch_time,
      source_filename: sourceFilename,
      uploaded_by: uploadedBy,
    });
  }

  let inserted = 0;
  let skipped = 0;
  if (toInsert.length > 0) {
    // ignoreDuplicates makes re-sending overlapping ranges a no-op, which is
    // what lets a device replay its buffer and a weekly file overlap the last
    // one without creating doubles.
    const { error, count } = await admin
      .from("biometric_punches")
      .upsert(toInsert, {
        onConflict: "employee_id,punch_time",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) throw new Error(error.message);
    inserted = count ?? 0;
    skipped = toInsert.length - inserted;
  }

  return {
    received: rows.length,
    inserted,
    skipped_duplicates: skipped,
    errors,
  };
}
