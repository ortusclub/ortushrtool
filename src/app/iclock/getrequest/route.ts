import { checkDeviceSerial, textResponse } from "@/lib/biometric/device";

/**
 * ADMS command poll. The device asks this repeatedly for work to do (reboot,
 * sync users, change time…). We push nothing back, so the answer is always a
 * bare "OK" — but the endpoint has to exist and answer promptly, or the
 * firmware treats the server as unreachable and can stop posting attendance
 * altogether.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sn = searchParams.get("SN");

  const check = checkDeviceSerial(sn);
  if (!check.allowed) return textResponse("Unauthorized", 401);

  return textResponse("OK");
}
