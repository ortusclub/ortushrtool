import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";

/**
 * Dismiss a pending-approval reminder. Only the approver being chased (the
 * flag's manager) or HR can dismiss — never the employee who filed the
 * request, who would otherwise be able to silence the nudge on their own
 * request. Mirrors the attendance-flag ack rules.
 *
 * Dismissing drops the request from the daily digest; the flag row itself
 * stays until the request is actually approved or rejected, at which point
 * the cron deletes it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flagId } = await params;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: flag } = await admin
    .from("request_reminder_flags")
    .select("id, manager_id, employee_id, acknowledged")
    .eq("id", flagId)
    .single();

  if (!flag) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  if (flag.acknowledged) {
    return NextResponse.json(
      { error: "Reminder already dismissed" },
      { status: 409 }
    );
  }

  if (flag.employee_id === caller.id) {
    return NextResponse.json(
      { error: "You cannot dismiss a reminder for your own request" },
      { status: 403 }
    );
  }

  const isAdmin = hasRole(caller.role, "hr_admin");
  if (!isAdmin && flag.manager_id !== caller.id) {
    return NextResponse.json(
      { error: "Only the approver or HR can dismiss this reminder" },
      { status: 403 }
    );
  }

  const { error } = await admin
    .from("request_reminder_flags")
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: caller.id,
    })
    .eq("id", flagId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
