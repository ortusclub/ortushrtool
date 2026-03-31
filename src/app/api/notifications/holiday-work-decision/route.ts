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

  const { request_id, status, notes } = await request.json();

  const admin = createAdminClient();

  const { data: hwRequest } = await admin
    .from("holiday_work_requests")
    .select("*, employee:users!holiday_work_requests_employee_id_fkey(full_name, email, manager_id), holiday:holidays!holiday_work_requests_holiday_id_fkey(name)")
    .eq("id", request_id)
    .single();

  if (!hwRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const isApproved = status === "approved";
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const employeeName = hwRequest.employee.full_name || hwRequest.employee.email;
  const locationLabel = hwRequest.work_location === "online" ? "Online" : "Office";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f2937;">Holiday Work Request ${isApproved ? "Approved" : "Rejected"}</h2>
      <div style="background: ${isApproved ? "#f0fdf4" : "#fef2f2"}; border: 1px solid ${isApproved ? "#bbf7d0" : "#fecaca"}; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-weight: bold; color: ${isApproved ? "#166534" : "#991b1b"};">
          ${employeeName}'s request to work on ${hwRequest.holiday.name} has been ${status}.
        </p>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280;">Employee</td><td style="padding: 8px 0; font-weight: bold;">${employeeName}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Holiday</td><td style="padding: 8px 0;">${hwRequest.holiday.name}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Date</td><td style="padding: 8px 0;">${hwRequest.holiday_date}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Hours</td><td style="padding: 8px 0;">${hwRequest.start_time} - ${hwRequest.end_time}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Location</td><td style="padding: 8px 0;">${locationLabel}</td></tr>
      </table>
      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
      <a href="${APP_URL}/requests" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">View in App</a>
    </div>
  `;

  const recipients: string[] = [hwRequest.employee.email];

  if (hwRequest.employee.manager_id) {
    const { data: manager } = await admin
      .from("users")
      .select("email")
      .eq("id", hwRequest.employee.manager_id)
      .single();
    if (manager) recipients.push(manager.email);
  }

  const { data: reviewer } = await admin
    .from("users")
    .select("email")
    .eq("id", authUser.id)
    .single();
  if (reviewer && !recipients.includes(reviewer.email)) {
    recipients.push(reviewer.email);
  }

  const result = await sendEmail({
    to: [...new Set(recipients)],
    subject: `Holiday Work ${isApproved ? "Approved" : "Rejected"}: ${employeeName} — ${hwRequest.holiday.name}`,
    html,
  });

  for (const email of recipients) {
    await admin.from("notification_log").insert({
      type: "holiday_work_decision",
      recipient_email: email,
      subject: `Holiday Work Request ${status}`,
      related_id: request_id,
      status: result.success ? "sent" : "failed",
    });
  }

  return NextResponse.json({ success: result.success });
}
