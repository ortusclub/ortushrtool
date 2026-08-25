import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBiometricExport, type ParsedPunch } from "@/lib/biometric/parse";
import { ingestPunches } from "@/lib/biometric/ingest";

export const maxDuration = 60;

/**
 * Machine-callable punch ingest — the scripted counterpart to the HR upload
 * page, for whatever runs the weekly export (a scheduled script, a relay, a
 * Drive-watcher). Authenticated with a bearer secret rather than a session,
 * since no browser is involved:
 *
 *   curl -X POST https://<host>/api/biometric/ingest \
 *     -H "Authorization: Bearer $BIOMETRIC_INGEST_SECRET" \
 *     -H "Content-Type: text/plain" \
 *     --data-binary @export.txt
 *
 * Accepts either the raw export text (text/plain) or
 * {rows:[{biometric_id,name,punch_time}], source_filename} as JSON.
 *
 * Re-posting an overlapping range is safe — punches dedupe on
 * (employee_id, punch_time).
 */
export async function POST(request: Request) {
  const secret = process.env.BIOMETRIC_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "BIOMETRIC_INGEST_SECRET is not configured" },
      { status: 503 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let rows: ParsedPunch[] = [];
  let parseErrors: string[] = [];
  let sourceFilename: string | null = null;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (typeof body.text === "string") {
      // JSON envelope carrying the raw export.
      ({ rows, errors: parseErrors } = parseBiometricExport(body.text));
    } else if (Array.isArray(body.rows)) {
      rows = body.rows;
    }
    sourceFilename = body.source_filename ?? null;
  } else {
    const text = await request.text();
    ({ rows, errors: parseErrors } = parseBiometricExport(text));
    sourceFilename =
      request.headers.get("x-source-filename") ?? `ingest:${new Date().toISOString().slice(0, 10)}`;
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No usable rows", parse_errors: parseErrors.slice(0, 20) },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const result = await ingestPunches(admin, rows, {
      sourceFilename,
      uploadedBy: null,
      checkNames: true,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      parse_errors: parseErrors.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
