import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

  const { userId } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get user email
  const { data: targetUser } = await admin
    .from("users")
    .select(
      "email, full_name, preferred_name, first_name, last_name, department, job_title, location"
    )
    .eq("id", userId)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Generate a password reset link
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: targetUser.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/set-password`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send the reset email via Resend (Supabase's built-in email may not be configured)
  const { sendEmail } = await import("@/lib/email/resend");

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // The action_link from generateLink contains the token
  const resetLink = data.properties?.action_link || `${APP_URL}/login`;

  const { subject, html } = await loadAndRender("password_reset", {
    ...getUniversalVars(targetUser, null, APP_URL),
    reset_link: resetLink,
  });

  const result = await sendEmail({
    to: targetUser.email,
    subject,
    html,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
