import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";
import { INCIDENT_TYPE_LABELS, type IncidentType } from "@/types/database";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { report_id } = await request.json();
  if (!report_id) {
    return NextResponse.json({ error: "Missing report_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: report } = await admin
    .from("incident_reports")
    .select(
      "id, incident_date, incident_type, location, summary, outcome, people_involved_other, reporter:users!incident_reports_reporter_id_fkey(full_name, email, preferred_name, first_name, last_name, department, job_title, location)"
    )
    .eq("id", report_id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const reporter = Array.isArray(report.reporter)
    ? report.reporter[0]
    : report.reporter;

  // Fixed list of incident-report recipients. Edit here to change who is
  // notified — intentionally NOT role-based, so sensitive reports only reach
  // these specific people.
  const hrEmails = [
    "dfoz@ortusclub.com",
    "jamie@ortusclub.com",
    "damon@ortusclub.com",
    "brad.u@ortusclub.com",
  ];

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const reporterName = reporter?.full_name || reporter?.email || "An employee";
  const typeLabel =
    INCIDENT_TYPE_LABELS[report.incident_type as IncidentType] ??
    report.incident_type;

  const detailRows: [string, string][] = [
    ["Date of incident", report.incident_date],
    ["Type", typeLabel],
  ];
  if (report.location) detailRows.push(["Location", report.location]);
  if (report.people_involved_other)
    detailRows.push(["Others involved", report.people_involved_other]);
  detailRows.push(["Summary", report.summary]);
  if (report.outcome) detailRows.push(["Effect / outcome", report.outcome]);

  const detailsHtml =
    `<ul>\n` +
    detailRows
      .map(([k, v]) => `  <li><strong>${k}:</strong> ${escapeHtml(String(v))}</li>`)
      .join("\n") +
    `\n</ul>`;

  const universal = getUniversalVars(reporter, null, APP_URL);
  const { subject, html } = await loadAndRender("incident_submitted", {
    ...universal,
    employee_name: reporterName,
    incident_details_html: detailsHtml,
  });

  const result = await sendEmail({ to: hrEmails, subject, html });

  return NextResponse.json({ success: result.success });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
