import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { holiday_name, holiday_date, start_time, end_time, work_location, reason } = await request.json();

  const admin = createAdminClient();

  const { data: employee } = await admin
    .from("users")
    .select("full_name, email, manager_id")
    .eq("id", authUser.id)
    .single();

  if (!employee?.manager_id) {
    return NextResponse.json({ error: "No manager assigned" }, { status: 400 });
  }

  const { data: manager } = await admin
    .from("users")
    .select("email, full_name")
    .eq("id", employee.manager_id)
    .single();

  if (!manager) {
    return NextResponse.json({ error: "Manager not found" }, { status: 400 });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const locationLabel = work_location === "online" ? "Online" : "Office";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f2937;">Work on Holiday Request</h2>
      <p>${employee.full_name || employee.email} is requesting to work on a holiday.</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280;">Holiday</td><td style="padding: 8px 0; font-weight: bold;">${holiday_name}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Date</td><td style="padding: 8px 0;">${holiday_date}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Hours</td><td style="padding: 8px 0;">${start_time} - ${end_time}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Location</td><td style="padding: 8px 0;">${locationLabel}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Reason</td><td style="padding: 8px 0;">${reason}</td></tr>
      </table>
      <a href="${APP_URL}/requests" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px;">Review Request</a>
    </div>
  `;

  const result = await sendEmail({
    to: manager.email,
    subject: `Holiday Work Request from ${employee.full_name || employee.email}`,
    html,
  });

  await admin.from("notification_log").insert({
    type: "holiday_work_request",
    recipient_email: manager.email,
    subject: `Holiday Work Request from ${employee.full_name}`,
    status: result.success ? "sent" : "failed",
  });

  return NextResponse.json({ success: result.success });
}
