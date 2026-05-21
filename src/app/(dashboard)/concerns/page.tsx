import Link from "next/link";
import { AlertTriangle, MessageSquare, ShieldCheck, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { hasRole, formatDate } from "@/lib/utils";

export default async function ConcernsLandingPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const isAdmin = hasRole(user.role, "hr_admin");

  // Reporter's own incident history (RLS: SELECT returns my rows + HR sees all)
  const { data: myReports } = await supabase
    .from("incident_reports")
    .select("id, incident_date, incident_type, status, summary, created_at")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Report a Concern</h1>
        <p className="text-gray-600">
          A safe place to raise issues — formally as an incident report, or
          anonymously as feedback.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/concerns/incident"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-blue-50 p-2 text-blue-600 group-hover:bg-blue-100">
              <AlertTriangle size={20} />
            </span>
            <h2 className="text-lg font-semibold text-gray-900">
              Report an Incident
            </h2>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            File a formal incident report. Your name is attached so HR can
            follow up with you. Visible to you and HR only.
          </p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500">
            <ShieldCheck size={12} /> Confidential to HR & you
          </p>
        </Link>

        <Link
          href="/concerns/feedback"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-teal-300 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-600 group-hover:bg-teal-100">
              <MessageSquare size={20} />
            </span>
            <h2 className="text-lg font-semibold text-gray-900">
              Anonymous Feedback
            </h2>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Share thoughts, concerns, or suggestions without identifying
            yourself. We do not store any link between you and the message.
          </p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500">
            <Lock size={12} /> Truly anonymous
          </p>
        </Link>
      </div>

      {isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">HR view</p>
          <p className="mt-1">
            You can review all submissions on the{" "}
            <Link
              href="/concerns/admin"
              className="font-medium underline hover:text-amber-700"
            >
              Concerns admin page
            </Link>
            .
          </p>
        </div>
      )}

      {myReports && myReports.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              My Past Incident Reports
            </h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {myReports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/concerns/${r.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(r.incident_date)} —{" "}
                      <span className="capitalize">
                        {r.incident_type.replace("_", " ")}
                      </span>
                    </p>
                    <p className="truncate text-xs text-gray-500">{r.summary}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 capitalize">
                    {r.status.replace("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
