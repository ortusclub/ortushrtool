import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { DOCUMENT_TYPE_LABELS, type DocumentRequest } from "@/types/database";

export default async function TeamMemberDocumentsTab({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { userId } = await params;
  const isOwnProfile = currentUser.id === userId;
  const isAdmin = hasRole(currentUser.role, "hr_admin");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("manager_id")
    .eq("id", userId)
    .single();
  const isDirectManager = user?.manager_id === currentUser.id;
  if (!(isAdmin || isOwnProfile || isDirectManager)) redirect(`/team/${userId}`);

  const { data: documentHistory } = await supabase
    .from("document_requests")
    .select("*")
    .eq("employee_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const docs = (documentHistory ?? []) as DocumentRequest[];

  const statusStyles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    processed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-sm uppercase tracking-wide text-gray-500">
        <FileText size={14} />
        Document Request History
      </h2>
      {docs.length === 0 ? (
        <p className="text-sm text-gray-500">No document requests on record.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {docs.map((d) => {
            const docName =
              d.document_type === "other"
                ? d.custom_document_name || "Other"
                : DOCUMENT_TYPE_LABELS[d.document_type];
            return (
              <div key={d.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{docName}</span>
                    <span className="text-xs text-gray-500">
                      {format(parseISO(d.created_at.slice(0, 10)), "MMM d, yyyy")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Addressed to <strong>{d.addressee}</strong>
                  </p>
                  {d.document_type === "purpose_of_travel" && d.event_name && (
                    <p className="text-xs text-gray-500">
                      {d.event_name} — {d.event_city}, {d.event_country}
                      {d.event_date && ` (${format(parseISO(d.event_date), "MMM d, yyyy")})`}
                    </p>
                  )}
                  {d.document_type === "leave_certificate" &&
                    d.leave_start_date &&
                    d.leave_end_date && (
                      <p className="text-xs text-gray-500">
                        Leave: {format(parseISO(d.leave_start_date), "MMM d, yyyy")} to{" "}
                        {format(parseISO(d.leave_end_date), "MMM d, yyyy")}
                      </p>
                    )}
                  {d.processor_notes && (
                    <p className="text-xs text-gray-700">
                      <span className="font-medium">HR note:</span>{" "}
                      <span className="italic">{d.processor_notes}</span>
                    </p>
                  )}
                  {d.processor_attachment_url && (
                    <p className="text-xs">
                      <a
                        href={d.processor_attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Open attachment ↗
                      </a>
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    statusStyles[d.status] ?? "bg-gray-100"
                  }`}
                >
                  {d.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
