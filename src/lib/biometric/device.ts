/**
 * Device-side helpers for the ADMS/PUSH endpoints.
 *
 * ADMS has no authentication of its own — the device just posts to a URL. So
 * the gate is an allowlist of device serial numbers in
 * BIOMETRIC_DEVICE_SERIALS (comma-separated).
 *
 * When that variable is unset the endpoint runs in LEARN MODE: it accepts the
 * post and logs the serial so it can be pinned afterwards. This exists purely
 * so the very first scan can be traced without knowing the serial in advance —
 * set the variable as soon as you have it. Learn mode is still narrow: a punch
 * only lands if its PIN matches an existing users.biometric_id, so an
 * unknown caller cannot invent attendance for anyone.
 */

export type SerialCheck =
  | { allowed: true; learnMode: boolean }
  | { allowed: false; learnMode: false };

export function checkDeviceSerial(sn: string | null): SerialCheck {
  const configured = (process.env.BIOMETRIC_DEVICE_SERIALS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    console.warn(
      `[iclock] LEARN MODE — BIOMETRIC_DEVICE_SERIALS is unset. Accepting SN="${sn ?? "(none)"}". ` +
        `Set BIOMETRIC_DEVICE_SERIALS to this value to lock the endpoint down.`
    );
    return { allowed: true, learnMode: true };
  }
  if (!sn || !configured.includes(sn)) {
    console.warn(`[iclock] rejected unknown SN="${sn ?? "(none)"}"`);
    return { allowed: false, learnMode: false };
  }
  return { allowed: true, learnMode: false };
}

/**
 * The handshake reply the device expects on its first GET. It's plain text
 * key=value, not JSON — the firmware parses it literally and will retry
 * forever if the shape is wrong.
 *
 * Realtime=1 asks the device to post each scan as it happens rather than
 * batching, which is the whole point of this path.
 */
export function buildHandshakeReply(sn: string): string {
  return [
    `GET OPTION FROM: ${sn}`,
    "Stamp=9999",
    "OpStamp=0",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=1111000000",
    "Realtime=1",
    "Encrypt=0",
    "TimeZone=8",
  ].join("\n");
}

/** ADMS replies are plain text; anything else makes the device retry. */
export function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
