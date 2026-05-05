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

  const { requested_date, original_time, requested_time, reason } =
    await request.json();

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

  // Get manager email
  const { data: manager } = await admin
    .from("users")
    .select("email, full_name")
    .eq("id", employee.manager_id)
    .single();

  if (!manager) {
    return NextResponse.json({ error: "Manager not found" }, { status: 400 });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { subject, html } = await loadAndRender("adjustment_submitted", {
    ...getUniversalVars(employee, manager, APP_URL),
    employee_name: employee.full_name || employee.email,
    requested_date,
    original_time,
    requested_time,
    reason,
  });

  const result = await sendEmail({
    to: manager.email,
    subject,
    html,
  });

  // Log notification
  await admin.from("notification_log").insert({
    type: "schedule_adjustment_request",
    recipient_email: manager.email,
    subject: `Schedule Adjustment Request from ${employee.full_name}`,
    status: result.success ? "sent" : "failed",
  });

  return NextResponse.json({ success: result.success });
}
