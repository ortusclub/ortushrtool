import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { IncidentForm } from "@/components/concerns/incident-form";

export default async function IncidentReportPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Directory of active employees the reporter can tag as "people involved".
  // RLS already lets every employee read the users table; this is just to
  // power the picker.
  const { data: candidates } = await supabase
    .from("users")
    .select("id, full_name, preferred_name, first_name, last_name, email")
    .eq("is_active", true)
    .order("full_name");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/concerns"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Workplace Concerns
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Report an Incident</h1>
        <p className="text-gray-600">
          Your name is attached so HR can follow up with you.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <Lock size={18} className="mt-0.5 shrink-0 text-blue-600" />
        <p className="text-sm text-blue-900">
          Incident reports are confidential and only visible to the internal HR
          team. No one else — including your manager or colleagues — can see
          what you submit here.
        </p>
      </div>

      <IncidentForm
        currentUserId={user.id}
        candidates={(candidates ?? []).filter((c) => c.id !== user.id)}
      />
    </div>
  );
}
