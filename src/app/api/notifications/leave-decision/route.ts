import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leave_id, status, notes } = await request.json();

  const admin = createAdminClient();

  // Get leave request details with employee AND manager
  const { data: leave } = await admin
    .from("leave_requests")
    .select(
      "*, employee:users!leave_requests_employee_id_fkey(full_name, email, preferred_name, first_name, last_name, department, job_title, location, manager_id)"
    )
    .eq("id", leave_id)
    .single();

  if (!leave) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  const leaveLabels: Record<string, string> = {
    annual: "Annual Leave",
    sick: "Sick Leave",
    personal: "Personal Leave",
    unpaid: "Unpaid Leave",
    other: "Other",
  };

  const isApproved = status === "approved";
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const employeeName = leave.employee.full_name || leave.employee.email;

  // Send to employee AND manager
  const recipients: string[] = [leave.employee.email];
  let manager: { email: string; full_name: string | null } | null = null;
  if (leave.employee.manager_id) {
    const { data: m } = await admin
      .from("users")
      .select("email, full_name")
      .eq("id", leave.employee.manager_id)
      .single();
    if (m) {
      manager = m;
      recipients.push(m.email);
    }
  }

  const templateType = isApproved ? "leave_approved" : "leave_rejected";
  const { subject, html } = await loadAndRender(templateType, {
    ...getUniversalVars(leave.employee, manager, APP_URL),
    employee_name: employeeName,
    leave_type: leaveLabels[leave.leave_type] ?? leave.leave_type,
    start_date: leave.start_date,
    end_date: leave.end_date,
    reason: leave.reason,
    notes: notes || "",
  });

  // Include reviewer if different
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
    subject,
    html,
  });

  // Log notifications
  for (const email of recipients) {
    await admin.from("notification_log").insert({
      type: "leave_decision",
      recipient_email: email,
      subject: `Leave Request ${status}`,
      related_id: leave_id,
      status: result.success ? "sent" : "failed",
    });
  }

  return NextResponse.json({ success: result.success });
}
