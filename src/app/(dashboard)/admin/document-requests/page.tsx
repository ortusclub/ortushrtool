import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { DocumentRequestsManager } from "@/components/admin/document-requests-manager";
import type { DocumentRequestWithEmployee } from "@/types/database";

export default async function HRDocumentRequestsPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("document_requests")
    .select(
      "*, employee:users!document_requests_employee_id_fkey(full_name, preferred_name, first_name, last_name, email), processor:users!document_requests_processed_by_fkey(full_name, preferred_name, first_name, last_name, email)"
    )
    .order("created_at", { ascending: false });

  const all = (requests ?? []) as DocumentRequestWithEmployee[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">Document Requests</h1>
        <p className="text-gray-600">
          Employee-submitted document requests. Mark as processed once you&apos;ve
          sent the document — the employee can see the status on their side.
        </p>
      </div>
      <DocumentRequestsManager initialRequests={all} />
    </div>
  );
}
