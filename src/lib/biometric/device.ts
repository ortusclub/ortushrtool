/**
 * Device-side helpers for the ADMS/PUSH endpoints.
 *
 * ADMS has no authentication of its own — the device just posts to a URL. So
 * the gate is an allowlist of device serial numbers in
 * BIOMETRIC_DEVICE_SERIALS (comma-separated).
 *
 * With nothing configured the endpoint is CLOSED: every request is rejected.
 * That is the safe default for a route that has to be publicly reachable and
 * cannot ask for credentials, in a public repository where the path is not
 * secret.
 *
 * Bringing a device online is a chicken-and-egg problem — you need its serial
 * to allowlist it, and the reliable way to learn the serial is to let it talk
 * once. Set BIOMETRIC_LEARN_MODE=true to allow that: requests are accepted and
 * the serial logged, so it can be pinned in BIOMETRIC_DEVICE_SERIALS and learn
 * mode turned off again. Even then a punch only lands if its PIN matches an
 * existing users.biometric_id, so an unknown caller cannot invent attendance
 * for someone who is not enrolled.
 */

export type SerialCheck =
  | { allowed: true; learnMode: boolean }
  | { allowed: false; learnMode: false };

export function checkDeviceSerial(sn: string | null): SerialCheck {
  const configured = (process.env.BIOMETRIC_DEVICE_SERIALS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const learnMode = process.env.BIOMETRIC_LEARN_MODE === "true";

  if (configured.length === 0) {
    if (!learnMode) {
      console.warn(
        `[iclock] CLOSED — no BIOMETRIC_DEVICE_SERIALS configured, rejecting SN="${sn ?? "(none)"}". ` +
          `Set BIOMETRIC_LEARN_MODE=true to discover a device's serial.`
      );
      return { allowed: false, learnMode: false };
    }
    console.warn(
      `[iclock] LEARN MODE — accepting SN="${sn ?? "(none)"}". Add it to ` +
        `BIOMETRIC_DEVICE_SERIALS and unset BIOMETRIC_LEARN_MODE to close the endpoint.`
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
