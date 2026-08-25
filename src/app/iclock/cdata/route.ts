import { createAdminClient } from "@/lib/supabase/admin";
import { parseAdmsAttlog } from "@/lib/biometric/parse";
import { ingestPunches } from "@/lib/biometric/ingest";
import {
  buildHandshakeReply,
  checkDeviceSerial,
  textResponse,
} from "@/lib/biometric/device";

/**
 * ADMS/PUSH endpoint for the office fingerprint scanner (David-Link FM-1100).
 *
 * The device is hard-wired to talk to /iclock/cdata — hence this living
 * outside /api. Two calls matter:
 *
 *   GET  /iclock/cdata?SN=…&options=all   → handshake, we reply with config
 *   POST /iclock/cdata?SN=…&table=ATTLOG  → punches, tab-delimited plain text
 *
 * Every reply must be plain text in the shape the firmware expects; a JSON
 * body or an unexpected status makes the device treat the post as failed and
 * retry it later. Replies to ATTLOG must be exactly "OK: <count>".
 *
 * NOTE: this route is deliberately exempt from session auth (see
 * lib/supabase/middleware.ts) — the device has no cookies. It is gated on the
 * device serial instead.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sn = searchParams.get("SN");

  const check = checkDeviceSerial(sn);
  if (!check.allowed) return textResponse("Unauthorized", 401);

  // Handshake / config pull.
  return textResponse(buildHandshakeReply(sn ?? "unknown"));
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const sn = searchParams.get("SN");
  const table = searchParams.get("table") ?? "";

  const check = checkDeviceSerial(sn);
  if (!check.allowed) return textResponse("Unauthorized", 401);

  const body = await request.text();

  // The device also posts OPERLOG (door events, admin actions) and USERINFO
  // (enrolments) to this same URL. We only consume attendance; everything
  // else must still be acknowledged or the device retries it forever.
  if (!/ATTLOG/i.test(table)) {
    return textResponse("OK");
  }

  const { rows, errors: parseErrors } = parseAdmsAttlog(body);
  if (parseErrors.length > 0) {
    console.warn(`[iclock] SN=${sn} parse errors:`, parseErrors.slice(0, 10));
  }
  if (rows.length === 0) {
    // Nothing usable, but acknowledge so the device doesn't spin on it.
    return textResponse("OK: 0");
  }

  try {
    const admin = createAdminClient();
    const result = await ingestPunches(admin, rows, {
      sourceFilename: `iclock:${sn ?? "unknown"}`,
      uploadedBy: null,
      // ADMS sends only a PIN — there's no name to cross-check.
      checkNames: false,
    });
    if (result.errors.length > 0) {
      console.warn(
        `[iclock] SN=${sn} ${result.errors.length} unmatched punches:`,
        result.errors.slice(0, 10)
      );
    }
    console.log(
      `[iclock] SN=${sn} received=${result.received} inserted=${result.inserted} ` +
        `duplicates=${result.skipped_duplicates} unmatched=${result.errors.length}` +
        (check.learnMode ? " (LEARN MODE)" : "")
    );
    // Acknowledge everything we parsed. Reporting only the inserted count
    // would make the device re-send rows we intentionally skipped as
    // duplicates, and it would never stop.
    return textResponse(`OK: ${rows.length}`);
  } catch (error) {
    console.error("[iclock] ingest failed:", error);
    // Do NOT acknowledge — the device keeps the records buffered and retries,
    // so a transient database problem doesn't silently lose a day's punches.
    return textResponse("Error", 500);
  }
}
