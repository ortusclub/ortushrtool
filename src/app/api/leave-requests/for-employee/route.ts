import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const {
    employee_id,
    leave_type,
    leave_duration,
    half_day_period,
    half_day_start_time,
    half_day_end_time,
    start_date,
    end_date,
    reason,
    auto_approve,
  } = body;

  if (!employee_id || !leave_type || !start_date) {
    return NextResponse.json(
      { error: "employee_id, leave_type, and start_date are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("id, manager_id")
    .eq("id", employee_id)
    .single();
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const isAdmin = hasRole(caller.role, "hr_admin");
  const isSelf = authUser.id === employee_id;
  const isDirectManager = target.manager_id === authUser.id;
  if (!isAdmin && !isSelf && !isDirectManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only HR admins may skip approval; managers/self always file as pending.
  const autoApprove = isAdmin && auto_approve === true;

  const isHalfDay = leave_duration === "half_day";
  const { error } = await admin.from("leave_requests").insert({
    employee_id,
    leave_type,
    leave_duration: leave_duration ?? "full_day",
    half_day_period: isHalfDay ? half_day_period : null,
    half_day_start_time: isHalfDay ? half_day_start_time : null,
    half_day_end_time: isHalfDay ? half_day_end_time : null,
    start_date,
    end_date: isHalfDay ? start_date : end_date,
    reason: reason ?? "",
    status: autoApprove ? "approved" : "pending",
    reviewed_by: autoApprove ? authUser.id : null,
    reviewed_at: autoApprove ? new Date().toISOString() : null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only notify approvers when there's actually something to approve. An
  // auto-approved leave has no pending step, so the "submitted" email would
  // be misleading — skip it (mirrors the admin "Add Leave" auto-approve path).
  if (!autoApprove) {
    // Best-effort notification — don't block the response on it.
    fetch(new URL("/api/notifications/leave-submitted", request.url).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        leave_type,
        start_date,
        end_date: isHalfDay ? start_date : end_date,
        reason: reason ?? "",
        leave_duration: leave_duration ?? "full_day",
        half_day_period: isHalfDay ? half_day_period : null,
        target_employee_id: employee_id,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: autoApprove ? "approved" : "pending" });
}
