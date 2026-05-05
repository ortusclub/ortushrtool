import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!currentUser || !["hr_admin", "super_admin"].includes(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, full_name } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Generate an invite/recovery link so user can set their password
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/set-password`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resetLink = data.properties?.action_link || "";

  const { data: recipient } = await admin
    .from("users")
    .select(
      "full_name, email, preferred_name, first_name, last_name, department, job_title, location"
    )
    .eq("email", email)
    .maybeSingle();

  const { subject, html } = await loadAndRender("welcome", {
    ...getUniversalVars(recipient ?? { full_name, email }),
    employee_name: full_name || "there",
    reset_link: resetLink,
  });

  const result = await sendEmail({
    to: email,
    subject,
    html,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
