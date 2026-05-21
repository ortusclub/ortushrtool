import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole, formatDate, displayName } from "@/lib/utils";
import {
  INCIDENT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  type IncidentType,
  type IncidentStatus,
} from "@/types/database";
import { IncidentStatusEditor } from "@/components/concerns/incident-status-editor";

const statusStyles: Record<IncidentStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  in_review: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-200 text-gray-700",
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isAdmin = hasRole(user.role, "hr_admin");

  const { data: report } = await supabase
    .from("incident_reports")
    .select(
      "*, reporter:users!incident_reports_reporter_id_fkey(full_name, preferred_name, first_name, last_name, email)"
    )
    .eq("id", id)
    .single();

  if (!report) notFound();

  const reporter = Array.isArray(report.reporter) ? report.reporter[0] : report.reporter;

  // Resolve "people involved" UUIDs to names. RLS lets everyone read the
  // active directory, so a plain client query is fine.
  const involvedIds: string[] = report.people_involved_user_ids ?? [];
  const { data: involvedUsers } = involvedIds.length
    ? await supabase
        .from("users")
        .select("id, full_name, preferred_name, first_name, last_name, email")
        .in("id", involvedIds)
    : { data: [] };

  const { data: attachments } = await supabase
    .from("incident_report_attachments")
    .select("id, file_name, mime_type, size_bytes, storage_path, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: true });

  // Sign each attachment's storage path. Signed URLs are valid for 1 hour,
  // long enough for HR to download but not link-share permanently.
  const signedAttachments: {
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    url: string | null;
  }[] = [];
  for (const a of attachments ?? []) {
    const { data: signed } = await supabase.storage
      .from("concern-attachments")
      .createSignedUrl(a.storage_path, 3600);
    signedAttachments.push({
      id: a.id,
      file_name: a.file_name,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      url: signed?.signedUrl ?? null,
    });
  }

  const backHref = isAdmin ? "/concerns/admin" : "/concerns";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Incident Report
          </h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              statusStyles[report.status as IncidentStatus]
            }`}
          >
            {INCIDENT_STATUS_LABELS[report.status as IncidentStatus]}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Filed {formatDate(report.created_at.slice(0, 10))} by{" "}
          {reporter ? displayName(reporter) : "unknown"}
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        <Row label="Date of incident" value={formatDate(report.incident_date)} />
        <Row
          label="Type"
          value={
            INCIDENT_TYPE_LABELS[report.incident_type as IncidentType] ??
            report.incident_type
          }
        />
        {report.location && <Row label="Location" value={report.location} />}
        {(involvedUsers && involvedUsers.length > 0) ||
        report.people_involved_other ? (
          <Row
            label="People involved"
            value={
              <div className="space-y-1">
                {(involvedUsers ?? []).map((u) => (
                  <p key={u.id} className="text-sm text-gray-900">
                    {displayName(u)}{" "}
                    <span className="text-xs text-gray-500">({u.email})</span>
                  </p>
                ))}
                {report.people_involved_other && (
                  <p className="text-sm text-gray-700">
                    {report.people_involved_other}{" "}
                    <span className="text-xs text-gray-400">
                      (not in directory)
                    </span>
                  </p>
                )}
              </div>
            }
          />
        ) : null}
        <Row
          label="Summary"
          value={
            <p className="whitespace-pre-wrap text-sm text-gray-900">
              {report.summary}
            </p>
          }
        />
        {report.outcome && (
          <Row
            label="Effect or outcome"
            value={
              <p className="whitespace-pre-wrap text-sm text-gray-900">
                {report.outcome}
              </p>
            }
          />
        )}
        {signedAttachments.length > 0 && (
          <Row
            label="Attachments"
            value={
              <ul className="space-y-1.5">
                {signedAttachments.map((a) => (
                  <li key={a.id}>
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-blue-600 hover:bg-gray-50"
                      >
                        <Paperclip size={14} />
                        {a.file_name}
                        {a.size_bytes && (
                          <span className="text-xs text-gray-400">
                            ({(a.size_bytes / 1024).toFixed(1)} KB)
                          </span>
                        )}
                      </a>
                    ) : (
                      <span className="text-sm text-gray-500">
                        {a.file_name} (link unavailable)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            }
          />
        )}
      </div>

      {isAdmin ? (
        <IncidentStatusEditor
          reportId={report.id}
          initialStatus={report.status as IncidentStatus}
          initialNotes={report.handler_notes ?? ""}
        />
      ) : (
        report.handler_notes && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <p className="text-sm font-medium text-gray-700">HR notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
              {report.handler_notes}
            </p>
          </div>
        )
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <div className="mt-1 text-sm text-gray-900">
        {typeof value === "string" ? <p>{value}</p> : value}
      </div>
    </div>
  );
}
