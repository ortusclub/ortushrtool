import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { renderTemplate } from "@/lib/email/render";
import { applyEmailStyles } from "@/lib/email/styles";
import { UNIVERSAL_VARIABLES } from "@/lib/email/universal-vars";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!currentUser || currentUser.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { recipient_email, subject, body, variables } = await request.json();

  if (!recipient_email || !subject || !body) {
    return NextResponse.json(
      { error: "recipient_email, subject, and body are required" },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return NextResponse.json(
      { error: "Invalid recipient email" },
      { status: 400 }
    );
  }

  const sampleVars: Record<string, string> = {
    app_url:
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  };
  for (const name of UNIVERSAL_VARIABLES) {
    if (!(name in sampleVars)) sampleVars[name] = `[${name}]`;
  }
  if (typeof variables === "string") {
    for (const raw of variables.split(",")) {
      const name = raw.trim();
      if (name && !(name in sampleVars)) {
        sampleVars[name] = `[${name}]`;
      }
    }
  }

  const renderedSubject = `[TEST] ${renderTemplate(subject, sampleVars)}`;
  const renderedBody = applyEmailStyles(renderTemplate(body, sampleVars));

  const result = await sendEmail({
    to: recipient_email,
    subject: renderedSubject,
    html: renderedBody,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to send test email" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, messageId: result.messageId });
}
