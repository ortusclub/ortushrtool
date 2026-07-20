import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { resolveEffectiveRecipients } from "@/lib/email/recipients";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentRequest,
} from "@/types/database";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { document_request_id } = await request.json();
  if (!document_request_id) {
    return NextResponse.json(
      { error: "Missing document_request_id" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: docRequest } = await admin
    .from("document_requests")
    .select(
      "*, employee:users!document_requests_employee_id_fkey(full_name, email, preferred_name, first_name, last_name, department, job_title, location)"
    )
    .eq("id", document_request_id)
    .single();

  if (!docRequest) {
    return NextResponse.json(
      { error: "Document request not found" },
      { status: 404 }
    );
  }

  const r = docRequest as DocumentRequest & {
    employee: {
      full_name: string;
      email: string;
      preferred_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      department?: string | null;
      job_title?: string | null;
      location?: string | null;
    };
  };

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const documentTypeLabel =
    r.document_type === "other"
      ? r.custom_document_name || "Other"
      : DOCUMENT_TYPE_LABELS[r.document_type];

  // Build a single HTML block describing the request — used in both emails.
  const detailRows: [string, string][] = [
    ["Document", documentTypeLabel],
    ["Addressee", r.addressee],
  ];
  if (r.document_type === "purpose_of_travel") {
    if (r.event_name) detailRows.push(["Event", r.event_name]);
    if (r.event_tag) detailRows.push(["Event tag", r.event_tag]);
    if (r.event_city || r.event_country)
      detailRows.push([
        "Location",
        [r.event_city, r.event_country].filter(Boolean).join(", "),
      ]);
    if (r.event_date) detailRows.push(["Event date", r.event_date]);
  }
  if (r.document_type === "leave_certificate") {
    if (r.leave_start_date)
      detailRows.push(["Leave from", r.leave_start_date]);
    if (r.leave_end_date) detailRows.push(["Leave to", r.leave_end_date]);
  }
  if (r.additional_details) {
    detailRows.push(["Additional details", r.additional_details]);
  }
  const detailsHtml =
    `<ul>\n` +
    detailRows
      .map(([k, v]) => `  <li><strong>${k}:</strong> ${escapeHtml(v)}</li>`)
      .join("\n") +
    `\n</ul>`;

  const universal = getUniversalVars(r.employee, null, APP_URL);

  // 1) Confirmation copy to the requester
  const employeeMail = await loadAndRender("document_request_employee_copy", {
    ...universal,
    employee_name: r.employee.full_name || r.employee.email,
    document_type: documentTypeLabel,
    addressee: r.addressee,
    request_details_html: detailsHtml,
  });
  const employeeResult = await sendEmail({
    to: r.employee.email,
    subject: employeeMail.subject,
    html: employeeMail.html,
  });
  await admin.from("notification_log").insert({
    type: "document_request",
    recipient_email: r.employee.email,
    subject: employeeMail.subject,
    related_id: r.id,
    status: employeeResult.success ? "sent" : "failed",
  });

  // 2) Notification to HR (admin-configured recipients, else the default)
  const hrRecipients = await resolveEffectiveRecipients(
    admin,
    "document_request_hr_notification"
  );
  if (hrRecipients.length > 0) {
    const hrMail = await loadAndRender("document_request_hr_notification", {
      ...universal,
      employee_name: r.employee.full_name || r.employee.email,
      document_type: documentTypeLabel,
      addressee: r.addressee,
      request_details_html: detailsHtml,
    });
    const hrResult = await sendEmail({
      to: hrRecipients,
      subject: hrMail.subject,
      html: hrMail.html,
    });
    for (const email of hrRecipients) {
      await admin.from("notification_log").insert({
        type: "document_request",
        recipient_email: email,
        subject: hrMail.subject,
        related_id: r.id,
        status: hrResult.success ? "sent" : "failed",
      });
    }
  }

  return NextResponse.json({ success: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
