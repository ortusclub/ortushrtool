import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendEmail({
  to,
  cc,
  subject,
  html,
}: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resend = getResendClient();

  try {
    const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;
    const { data, error } = await resend.emails.send({
      from: "Ortus Club HR <hr@ortusclub.com>",
      to: Array.isArray(to) ? to : [to],
      ...(ccList && ccList.length > 0 ? { cc: ccList } : {}),
      subject,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
