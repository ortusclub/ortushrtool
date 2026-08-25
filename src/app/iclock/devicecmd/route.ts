import { checkDeviceSerial, textResponse } from "@/lib/biometric/device";

/**
 * Where the device reports the result of a command it was given. We never
 * issue commands, so this should stay quiet — but the firmware calls it as
 * part of its normal cycle and needs an acknowledgement.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const sn = searchParams.get("SN");

  const check = checkDeviceSerial(sn);
  if (!check.allowed) return textResponse("Unauthorized", 401);

  const body = await request.text().catch(() => "");
  if (body.trim()) console.log(`[iclock] devicecmd SN=${sn}: ${body.slice(0, 500)}`);

  return textResponse("OK");
}
