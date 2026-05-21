import Link from "next/link";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { formatDate, displayName } from "@/lib/utils";
import {
  INCIDENT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  FEEDBACK_CATEGORY_LABELS,
  type IncidentType,
  type IncidentStatus,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/types/database";
import { FeedbackStatusActions } from "@/components/concerns/feedback-status-actions";

type Tab = "incidents" | "feedback";

const statusStyles: Record<IncidentStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  in_review: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-200 text-gray-700",
};

const feedbackStatusStyles: Record<FeedbackStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  reviewed: "bg-green-100 text-green-700",
  archived: "bg-gray-200 text-gray-700",
};

export default async function ConcernsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab }>;
}) {
  await requireRole("hr_admin");
  const supabase = await createClient();
  const { tab = "incidents" } = await searchParams;

  const [{ data: incidents }, { data: feedback }] = await Promise.all([
    supabase
      .from("incident_reports")
      .select(
        "id, incident_date, incident_type, status, summary, created_at, reporter:users!incident_reports_reporter_id_fkey(full_name, preferred_name, first_name, last_name, email)"
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("anonymous_feedback")
      .select("id, category, subject, body, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Concerns — HR view</h1>
        <p className="text-gray-600">
          Review incident reports and anonymous feedback.
        </p>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <TabLink current={tab} value="incidents" label={`Incidents (${incidents?.length ?? 0})`} />
        <TabLink current={tab} value="feedback" label={`Feedback (${feedback?.length ?? 0})`} />
      </div>

      {tab === "incidents" ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {!incidents || incidents.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">
              No incident reports yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {incidents.map((r) => {
                const reporter = Array.isArray(r.reporter) ? r.reporter[0] : r.reporter;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/concerns/${r.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {INCIDENT_TYPE_LABELS[r.incident_type as IncidentType] ?? r.incident_type}
                          </span>
                          <span className="text-sm text-gray-700">
                            {formatDate(r.incident_date)}
                          </span>
                          <span className="text-xs text-gray-400">
                            Reported by {reporter ? displayName(reporter) : "unknown"}
                          </span>
                        </div>
                        <p className="truncate text-sm text-gray-600">
                          {r.summary}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusStyles[r.status as IncidentStatus] ?? "bg-gray-100"
                        }`}
                      >
                        {INCIDENT_STATUS_LABELS[r.status as IncidentStatus] ?? r.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {!feedback || feedback.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">
              No feedback yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {feedback.map((f) => (
                <li key={f.id} className="space-y-2 p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                      {FEEDBACK_CATEGORY_LABELS[f.category as FeedbackCategory] ?? f.category}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        feedbackStatusStyles[f.status as FeedbackStatus] ?? "bg-gray-100"
                      }`}
                    >
                      {f.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(f.created_at)}
                    </span>
                  </div>
                  {f.subject && (
                    <p className="text-sm font-semibold text-gray-900">
                      {f.subject}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-gray-700">
                    {f.body}
                  </p>
                  <FeedbackStatusActions
                    feedbackId={f.id}
                    currentStatus={f.status as FeedbackStatus}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TabLink({ current, value, label }: { current: Tab; value: Tab; label: string }) {
  const active = current === value;
  return (
    <Link
      href={`/concerns/admin?tab=${value}`}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </Link>
  );
}
