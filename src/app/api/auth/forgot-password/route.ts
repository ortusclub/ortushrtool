import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { resolveEffectiveRecipients } from "@/lib/email/recipients";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check if user exists
  const { data: user } = await admin
    .from("users")
    .select(
      "full_name, email, preferred_name, first_name, last_name, department, job_title, location"
    )
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    // Don't reveal if user exists or not
    return NextResponse.json({ success: true });
  }

  const recipients = await resolveEffectiveRecipients(
    admin,
    "forgot_password_alert"
  );
  if (recipients.length === 0) {
    return NextResponse.json({ success: true });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { subject, html } = await loadAndRender("forgot_password_alert", {
    ...getUniversalVars(user, null, APP_URL),
    employee_name: user.full_name || user.email,
    employee_email: user.email,
  });

  await sendEmail({
    to: recipients,
    subject,
    html,
  });

  // Log it
  for (const adminEmail of recipients) {
    await admin.from("notification_log").insert({
      type: "attendance_flag", // reuse existing type for now
      recipient_email: adminEmail,
      subject,
      status: "sent",
    });
  }

  return NextResponse.json({ success: true });
}
