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

export type AutoMatch = {
  biometric_id: number;
  device_name: string | null;
  user_id: string;
  full_name: string;
};

export type IngestResult = {
  received: number;
  inserted: number;
  skipped_duplicates: number;
  errors: IngestRowError[];
  /** Enrolment numbers claimed automatically this run — see autoMatch(). */
  auto_matched: AutoMatch[];
};

/** Fold accents and punctuation so "Inés" and "Ines" compare equal. */
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Does the source's name plausibly belong to this profile?
 *
 * The scanner stores names in a fixed 14-byte field — 6 characters of UTF-16
 * plus a terminator — so anything longer is silently cut: "Benedict" is
 * exported as "Benedi", "Khristian" as "Khrist". An equality check therefore
 * rejects most real rows, so a device name is accepted when it's a PREFIX of
 * any name on the profile.
 *
 * This is a sanity check, not the identity: biometric_id is what actually
 * resolves the person. Its job is to catch an enrolment number that has been
 * reassigned to someone else, which prefix matching still does — a wholly
 * different name won't prefix-match.
 */
function nameLooksRight(sourceName: string, candidates: (string | null)[]): boolean {
  const n = normalizeName(sourceName);
  if (!n) return true;
  return candidates
    .filter((c): c is string => Boolean(c))
    .map(normalizeName)
    .some((c) => c === n || c.startsWith(n));
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

  /**
   * Claim an unknown enrolment number for a user by name.
   *
   * Someone newly enrolled on the scanner has a number the HR tool has never
   * seen, so every punch they make is discarded until an admin notices and
   * maps them by hand. The device does send a name, so most of these can be
   * resolved without anyone intervening.
   *
   * The safety comes from the candidate pool: only ACTIVE users who do not
   * already hold an enrolment number, and only when exactly one of them
   * matches. That is what makes it safe despite the device truncating names —
   * "Audrey", "Charle" and "Nicole" are each ambiguous across the company, but
   * everyone they could refer to is already mapped, so they find no candidate
   * and are reported for review instead of being guessed at.
   *
   * A wrong guess would credit one person's attendance to another, which is
   * worse than a missing row — so anything less than a unique match is left
   * alone, and every claim made is returned in the result to be reported.
   */
  const claimedThisRun = new Map<number, { id: string; full_name: string }>();
  const autoMatched: AutoMatch[] = [];

  async function autoMatch(
    biometricId: number,
    deviceName: string | null
  ): Promise<{ id: string; full_name: string } | null> {
    if (!deviceName?.trim()) return null;
    const already = claimedThisRun.get(biometricId);
    if (already) return already;

    // Never take a number that belongs to someone, even inactive.
    const { data: taken } = await admin
      .from("users")
      .select("id")
      .eq("biometric_id", biometricId)
      .maybeSingle();
    if (taken) return null;

    const { data: pool } = await admin
      .from("users")
      .select("id, full_name, preferred_name, first_name")
      .eq("is_active", true)
      .is("biometric_id", null);

    const target = normalizeName(deviceName);
    if (target.length < 3) return null; // too short to be distinctive
    const hits = (pool ?? []).filter((u) =>
      [u.preferred_name, u.first_name, u.full_name]
        .filter((c): c is string => Boolean(c))
        .map(normalizeName)
        .some((c) => c === target || c.startsWith(target))
    );
    if (hits.length !== 1) return null;

    const winner = hits[0];
    const { error } = await admin
      .from("users")
      .update({ biometric_id: biometricId })
      .eq("id", winner.id)
      .is("biometric_id", null); // lost race = someone else got there first
    if (error) return null;

    const claimed = { id: winner.id, full_name: winner.full_name as string };
    claimedThisRun.set(biometricId, claimed);
    autoMatched.push({
      biometric_id: biometricId,
      device_name: deviceName,
      user_id: winner.id,
      full_name: claimed.full_name,
    });
    return claimed;
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
    let matched = userByBiometricId.get(row.biometric_id);
    if (!matched) {
      // Unknown number — try to claim it for someone by the name the device
      // sent, rather than discarding the punch and waiting for a human.
      const claimed = await autoMatch(row.biometric_id, row.name);
      if (!claimed) {
        errors.push({ ...row, reason: "No user with this biometric_id" });
        continue;
      }
      matched = {
        id: claimed.id,
        biometric_id: row.biometric_id,
        preferred_name: null,
        first_name: null,
        full_name: claimed.full_name,
      };
      userByBiometricId.set(row.biometric_id, matched);
      // Name already decided the match; re-checking it here would be circular.
      toInsert.push({
        employee_id: matched.id,
        punch_time: row.punch_time,
        source_filename: sourceFilename,
        uploaded_by: uploadedBy,
      });
      continue;
    }
    if (
      checkNames &&
      row.name &&
      !nameLooksRight(row.name, [
        matched.preferred_name,
        matched.first_name,
        matched.full_name,
      ])
    ) {
      errors.push({
        ...row,
        reason: `Name mismatch — device says "${row.name}", profile is "${
          matched.preferred_name ?? matched.full_name ?? "—"
        }". The enrolment number may have been reassigned.`,
      });
      continue;
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
    auto_matched: autoMatched,
  };
}
