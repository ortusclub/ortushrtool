import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";

function detailsList(rows: [string, string][]): string {
  return (
    `<ul>\n` +
    rows.map(([k, v]) => `  <li><strong>${k}:</strong> ${v}</li>`).join("\n") +
    `\n</ul>`
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { request_type, request_id } = await request.json();

  if (!request_type || !request_id) {
    return NextResponse.json({ error: "Missing request_type or request_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get employee details
  const { data: employee } = await admin
    .from("users")
    .select(
      "full_name, email, preferred_name, first_name, last_name, department, job_title, location, manager_id"
    )
    .eq("id", authUser.id)
    .single();

  if (!employee?.manager_id) {
    return NextResponse.json({ error: "No manager assigned" }, { status: 400 });
  }

  // Get manager details
  const { data: manager } = await admin
    .from("users")
    .select("email, full_name")
    .eq("id", employee.manager_id)
    .single();

  if (!manager) {
    return NextResponse.json({ error: "Manager not found" }, { status: 400 });
  }

  // Build request details based on type
  let details = "";
  let subject = "";
  const employeeName = employee.full_name || employee.email;

  if (request_type === "schedule_adjustment") {
    const { data: adj } = await admin
      .from("schedule_adjustments")
      .select("requested_date, requested_start_time, requested_end_time, reason")
      .eq("id", request_id)
      .eq("status", "pending")
      .single();

    if (!adj) {
      return NextResponse.json({ error: "Request not found or already decided" }, { status: 404 });
    }

    subject = `Reminder: Schedule Adjustment from ${employeeName}`;
    details = detailsList([
      ["Type", "Schedule Adjustment"],
      ["Date", adj.requested_date],
      ["Requested Hours", `${adj.requested_start_time} - ${adj.requested_end_time}`],
      ["Reason", adj.reason],
    ]);
  } else if (request_type === "leave") {
    const { data: leave } = await admin
      .from("leave_requests")
      .select("leave_type, start_date, end_date, reason")
      .eq("id", request_id)
      .eq("status", "pending")
      .single();

    if (!leave) {
      return NextResponse.json({ error: "Request not found or already decided" }, { status: 404 });
    }

    const leaveLabel = LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type;
    subject = `Reminder: ${leaveLabel} Request from ${employeeName}`;
    details = detailsList([
      ["Type", leaveLabel],
      ["From", leave.start_date],
      ["To", leave.end_date],
      ["Reason", leave.reason],
    ]);
  } else if (request_type === "holiday_work") {
    const { data: hw } = await admin
      .from("holiday_work_requests")
      .select("holiday_date, start_time, end_time, reason, work_location")
      .eq("id", request_id)
      .eq("status", "pending")
      .single();

    if (!hw) {
      return NextResponse.json({ error: "Request not found or already decided" }, { status: 404 });
    }

    subject = `Reminder: Holiday Work Request from ${employeeName}`;
    details = detailsList([
      ["Type", "Holiday Work"],
      ["Date", hw.holiday_date],
      ["Hours", `${hw.start_time} - ${hw.end_time}`],
      ["Location", hw.work_location === "office" ? "Office" : "Online"],
      ["Reason", hw.reason],
    ]);
  } else {
    return NextResponse.json({ error: "Invalid request_type" }, { status: 400 });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { subject: renderedSubject, html } = await loadAndRender("reminder", {
    ...getUniversalVars(employee, manager, APP_URL),
    employee_name: employeeName,
    request_type: request_type === "schedule_adjustment" ? "Schedule Adjustment" : request_type === "leave" ? "Leave" : "Holiday Work",
    details,
  });

  const result = await sendEmail({
    to: manager.email,
    subject: subject || renderedSubject,
    html,
  });

  await admin.from("notification_log").insert({
    type: "schedule_adjustment_request",
    recipient_email: manager.email,
    subject,
    status: result.success ? "sent" : "failed",
  });

  return NextResponse.json({ success: result.success });
}
