"use client";

import { useMemo, useState } from "react";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentRequestType,
  type DocumentRequestWithEmployee,
} from "@/types/database";
import { displayName, formatDate } from "@/lib/utils";
import { DocumentRequestActions } from "./document-request-actions";
import { DocumentRequestsExport } from "./document-requests-export";
import { UserNameLink } from "@/components/shared/user-name-link";

type StatusFilter = "all" | "pending" | "processed" | "cancelled";
type TypeFilter = "all" | DocumentRequestType;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "certificate_of_employment", label: "Certificate of Employment" },
  { value: "purpose_of_travel", label: "Purpose of Travel Letter" },
  { value: "leave_certificate", label: "Leave Certificate" },
  { value: "contract_copy", label: "Copy of Contract Agreement" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processed", label: "Processed" },
  { value: "cancelled", label: "Cancelled" },
];

export function DocumentRequestsManager({
  initialRequests,
}: {
  initialRequests: DocumentRequestWithEmployee[];
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [personQuery, setPersonQuery] = useState("");

  const filtered = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    return initialRequests.filter((r) => {
      if (typeFilter !== "all" && r.document_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      const created = r.created_at?.slice(0, 10) ?? "";
      if (fromDate && created < fromDate) return false;
      if (toDate && created > toDate) return false;
      if (q && r.employee) {
        const haystack = [
          r.employee.full_name,
          r.employee.preferred_name,
          r.employee.first_name,
          r.employee.last_name,
          r.employee.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      } else if (q) {
        return false;
      }
      return true;
    });
  }, [initialRequests, typeFilter, statusFilter, fromDate, toDate, personQuery]);

  const pending = filtered.filter((r) => r.status === "pending");
  const processed = filtered.filter((r) => r.status === "processed");
  const cancelled = filtered.filter((r) => r.status === "cancelled");

  const filterLabel =
    typeFilter === "all" ? "all" : typeFilter.replace(/_/g, "-");

  const hasActiveFilters =
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    !!fromDate ||
    !!toDate ||
    personQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-500">
              Document type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || undefined}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="block text-[11px] font-medium text-gray-500">
              Person
            </label>
            <input
              type="search"
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              placeholder="Filter by name or email..."
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                setStatusFilter("all");
                setFromDate("");
                setToDate("");
                setPersonQuery("");
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear filters
            </button>
          )}
          <div className="ml-auto">
            <DocumentRequestsExport
              requests={filtered}
              filterLabel={filterLabel}
            />
          </div>
        </div>
      </div>

      <RequestList
        title={`Pending (${pending.length})`}
        accent="border-yellow-200"
        empty="No pending requests."
        items={pending}
        showActions
      />

      <RequestList
        title={`Processed (${processed.length})`}
        accent="border-green-200"
        empty="None processed yet."
        items={processed}
        showActions
      />

      {(cancelled.length > 0 || statusFilter === "cancelled") && (
        <RequestList
          title={`Cancelled (${cancelled.length})`}
          accent="border-gray-200"
          empty="No cancelled requests."
          items={cancelled}
          showActions={false}
        />
      )}
    </div>
  );
}

function RequestList({
  title,
  accent,
  empty,
  items,
  showActions,
}: {
  title: string;
  accent: string;
  empty: string;
  items: DocumentRequestWithEmployee[];
  showActions: boolean;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-sm uppercase tracking-wider text-gray-500">
        {title}
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {empty}
        </div>
      ) : (
        <div className={`rounded-xl border ${accent} bg-white`}>
          {items.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 last:border-b-0"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900">
                    {r.document_type === "other"
                      ? r.custom_document_name || "Other"
                      : DOCUMENT_TYPE_LABELS[r.document_type]}
                  </p>
                  {r.employee && (
                    <span className="text-sm text-gray-600">
                      —{" "}
                      <UserNameLink
                        userId={r.employee_id}
                        name={displayName(r.employee)}
                      />
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Requested {formatDate(r.created_at.slice(0, 10))} · Addressed
                  to <strong>{r.addressee}</strong>
                </p>
                {r.document_type === "purpose_of_travel" && (
                  <p className="text-xs text-gray-700">
                    {r.event_name} ({r.event_tag || "—"}) · {r.event_city},{" "}
                    {r.event_country} ·{" "}
                    {r.event_date && formatDate(r.event_date)}
                  </p>
                )}
                {r.document_type === "leave_certificate" &&
                  r.leave_start_date &&
                  r.leave_end_date && (
                    <p className="text-xs text-gray-700">
                      Leave: {formatDate(r.leave_start_date)} to{" "}
                      {formatDate(r.leave_end_date)}
                    </p>
                  )}
                {r.additional_details && (
                  <p className="text-xs text-gray-600 italic">
                    Note: {r.additional_details}
                  </p>
                )}
                {r.status === "processed" && (
                  <p className="text-xs text-green-700">
                    Processed
                    {r.processor
                      ? ` by ${displayName(r.processor)}`
                      : ""}
                    {r.processed_at
                      ? ` on ${formatDate(r.processed_at.slice(0, 10))}`
                      : ""}
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
                      Attachment ↗
                    </a>
                  </p>
                )}
              </div>
              {showActions && r.status !== "cancelled" && (
                <DocumentRequestActions
                  requestId={r.id}
                  currentStatus={r.status}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
