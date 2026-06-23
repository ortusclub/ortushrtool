import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";
import { displayName } from "@/lib/utils";

const userCols = "full_name, preferred_name, first_name, last_name, email";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** HR forwards or dismisses a P2P feedback submission. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  if (!caller || !["hr_admin", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { action, recipient_user_id, hr_notes } = body as {
    action?: "forward" | "dismiss";
    recipient_user_id?: string;
    hr_notes?: string;
  };
  if (action !== "forward" && action !== "dismiss") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: feedback } = await admin
    .from("p2p_feedback")
    .select(
      `id, status, target_department, target_user_id, subject, message,
       target:users!p2p_feedback_target_user_id_fkey(${userCols})`
    )
    .eq("id", id)
    .single();
  if (!feedback) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (feedback.status !== "new") {
    return NextResponse.json(
      { error: "This feedback has already been actioned." },
      { status: 409 }
    );
  }

  const patch: Record<string, unknown> = {
    status: action === "forward" ? "forwarded" : "dismissed",
    hr_notes: hr_notes?.trim() || null,
    reviewed_by: authUser.id,
    reviewed_at: new Date().toISOString(),
  };

  if (action === "dismiss") {
    const { error } = await admin
      .from("p2p_feedback")
      .update(patch)
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // action === "forward"
  if (!recipient_user_id) {
    return NextResponse.json(
      { error: "recipient_user_id is required to forward" },
      { status: 400 }
    );
  }
  const { data: recipient } = await admin
    .from("users")
    .select(userCols)
    .eq("id", recipient_user_id)
    .single();
  if (!recipient?.email) {
    return NextResponse.json(
      { error: "Recipient not found or has no email" },
      { status: 400 }
    );
  }

  patch.recipient_user_id = recipient_user_id;
  const { error: updateError } = await admin
    .from("p2p_feedback")
    .update(patch)
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Send the recipient an anonymized email (no author identity).
  const target = Array.isArray(feedback.target)
    ? feedback.target[0]
    : feedback.target;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const detailRows: [string, string][] = [
    ["Department", feedback.target_department],
  ];
  if (target) detailRows.push(["Regarding", displayName(target)]);
  detailRows.push(["Subject", feedback.subject]);
  const detailsHtml =
    `<ul>\n` +
    detailRows
      .map(([k, v]) => `  <li><strong>${k}:</strong> ${escapeHtml(v)}</li>`)
      .join("\n") +
    `\n</ul>`;

  const universal = getUniversalVars(recipient, null, APP_URL);
  const mail = await loadAndRender("p2p_feedback_forwarded", {
    ...universal,
    feedback_details_html: detailsHtml,
    feedback_message: escapeHtml(feedback.message).replace(/\n/g, "<br>"),
    hr_note: hr_notes?.trim() ? escapeHtml(hr_notes.trim()) : "",
  });
  const result = await sendEmail({
    to: recipient.email,
    subject: mail.subject,
    html: mail.html,
  });
  await admin.from("notification_log").insert({
    type: "p2p_feedback",
    recipient_email: recipient.email,
    subject: mail.subject,
    related_id: id,
    status: result.success ? "sent" : "failed",
  });

  return NextResponse.json({ ok: true });
}
