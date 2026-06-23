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

/** Notify HR that a new P2P feedback submission landed in the review queue. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { feedback_id } = await request.json().catch(() => ({}));
  if (!feedback_id) {
    return NextResponse.json({ error: "Missing feedback_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: feedback } = await admin
    .from("p2p_feedback")
    .select(
      `id, target_department, subject, message,
       author:users!p2p_feedback_author_id_fkey(${userCols}),
       target:users!p2p_feedback_target_user_id_fkey(${userCols})`
    )
    .eq("id", feedback_id)
    .single();
  if (!feedback) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  // Fixed reviewer list — only these three are notified of new peer feedback.
  const hrEmails = [
    "brad.u@ortusclub.com",
    "jamie@ortusclub.com",
    "dfoz@ortusclub.com",
  ];

  const author = Array.isArray(feedback.author)
    ? feedback.author[0]
    : feedback.author;
  const target = Array.isArray(feedback.target)
    ? feedback.target[0]
    : feedback.target;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const detailRows: [string, string][] = [
    ["From", author ? displayName(author) : "unknown"],
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

  const universal = getUniversalVars(author, null, APP_URL);
  const mail = await loadAndRender("p2p_feedback_submitted", {
    ...universal,
    author_name: author ? displayName(author) : "An employee",
    feedback_details_html: detailsHtml,
    feedback_message: escapeHtml(feedback.message).replace(/\n/g, "<br>"),
  });
  const result = await sendEmail({
    to: hrEmails,
    subject: mail.subject,
    html: mail.html,
  });
  for (const email of hrEmails) {
    await admin.from("notification_log").insert({
      type: "p2p_feedback",
      recipient_email: email,
      subject: mail.subject,
      related_id: feedback.id,
      status: result.success ? "sent" : "failed",
    });
  }

  return NextResponse.json({ success: true });
}
