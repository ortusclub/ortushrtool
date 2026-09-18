import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { DocumentRequestForm } from "@/components/documents/document-request-form";
import { CancelRequest } from "@/components/shared/cancel-request";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentRequest,
} from "@/types/database";
import { formatDate } from "@/lib/utils";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("document_requests")
    .select("*")
    .eq("employee_id", user.id)
    .order("created_at", { ascending: false });

  const myRequests = (requests ?? []) as DocumentRequest[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">Document Requests</h1>
        <p className="text-gray-600">
          Request HR documents like a Certificate of Employment, travel letter,
          leave certificate, or contract copy.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-sm uppercase tracking-wider text-gray-500">
          New request
        </h2>
        <DocumentRequestForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm uppercase tracking-wider text-gray-500">
          My requests
        </h2>
        {myRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            You haven&apos;t requested any documents yet.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white">
            {myRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 last:border-b-0"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {r.document_type === "other"
                        ? r.custom_document_name || "Other"
                        : DOCUMENT_TYPE_LABELS[r.document_type]}
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-gray-500">
                    Requested {formatDate(r.created_at.slice(0, 10))} · Addressed
                    to <strong>{r.addressee}</strong>
                  </p>
                  {r.document_type === "purpose_of_travel" && (
                    <p className="text-xs text-gray-600">
                      {r.event_name} — {r.event_city}, {r.event_country}{" "}
                      ({r.event_date && formatDate(r.event_date)})
                    </p>
                  )}
                  {r.document_type === "leave_certificate" &&
                    r.leave_start_date &&
                    r.leave_end_date && (
                      <p className="text-xs text-gray-600">
                        Leave: {formatDate(r.leave_start_date)} to{" "}
                        {formatDate(r.leave_end_date)}
                      </p>
                    )}
                  {r.additional_details && (
                    <p className="text-xs text-gray-500 italic">
                      Note: {r.additional_details}
                    </p>
                  )}
                  {r.processor_notes && (
                    <p className="text-xs text-gray-700">
                      <strong>HR note:</strong> {r.processor_notes}
                    </p>
                  )}
                  {r.processor_attachment_url && (
                    <p className="text-xs">
                      <a
                        href={r.processor_attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Open attachment ↗
                      </a>
                    </p>
                  )}
                </div>
                {r.status === "pending" && (
                  <CancelRequest requestId={r.id} table="document_requests" />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    processed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-gray-100"}`}
    >
      {status}
    </span>
  );
}
