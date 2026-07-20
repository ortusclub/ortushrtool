import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, displayName } from "@/lib/utils";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { resolveEffectiveRecipients } from "@/lib/email/recipients";
import {
  applyScheduleWeeklyChange,
  type ScheduleWeeklyChangePayload,
} from "@/lib/pending-changes";

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

  const body = (await request.json().catch(() => ({}))) as {
    employee_id?: string;
    days?: ScheduleWeeklyChangePayload["days"];
    effective_from?: string;
  };
  const { employee_id, days, effective_from } = body;
  if (!employee_id || !Array.isArray(days) || days.length === 0) {
    return NextResponse.json(
      { error: "employee_id and days are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select(
      "id, manager_id, full_name, preferred_name, first_name, last_name, email"
    )
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

  const payload: ScheduleWeeklyChangePayload = {
    employee_id,
    effective_from: effective_from ?? new Date().toISOString().slice(0, 10),
    days,
  };

  if (isAdmin) {
    const result = await applyScheduleWeeklyChange(admin, authUser.id, payload);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Apply failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, queued: false });
  }

  const who = displayName(target);
  const { error } = await admin.from("pending_changes").insert({
    requested_by: authUser.id,
    change_type: "schedule_weekly_change",
    target_employee_id: employee_id,
    description: `Update weekly schedule for ${who}`,
    payload,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify reviewers so the queued change doesn't sit unseen. Best-effort:
  // the request still succeeds even if the email fails.
  try {
    const { data: requester } = await admin
      .from("users")
      .select("full_name, preferred_name, first_name, last_name, email")
      .eq("id", authUser.id)
      .single();
    const recipients = await resolveEffectiveRecipients(
      admin,
      "schedule_weekly_change_submitted"
    );
    if (recipients.length > 0) {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const requesterName = requester ? displayName(requester) : "An employee";
      const { subject, html } = await loadAndRender(
        "schedule_weekly_change_submitted",
        { requester_name: requesterName, employee_name: who, app_url: APP_URL }
      );
      await sendEmail({ to: recipients, subject, html });
    }
  } catch {
    /* notification is best-effort; never block the queued change */
  }

  return NextResponse.json({ ok: true, queued: true });
}
