"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { PendingChangeWithRequester } from "@/types/database";
import { displayName, formatDate } from "@/lib/utils";

type Filter = "pending" | "approved" | "rejected" | "all";

type ScheduleDay = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
  work_location: string;
};

const changeTypeLabel: Record<string, string> = {
  bulk_import: "Bulk import",
  field_value_upsert: "Field value update",
  field_value_delete: "Field value delete",
  multi_row_insert: "Add row",
  multi_row_update: "Update row",
  multi_row_delete: "Delete row",
  schedule_weekly_change: "Permanent schedule change",
};

export function PendingChangesQueue({
  initialChanges,
  currentSchedules = {},
}: {
  initialChanges: PendingChangeWithRequester[];
  /** employee_id -> their current effective weekly schedule (for diffing). */
  currentSchedules?: Record<string, ScheduleDay[]>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("pending");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: initialChanges.length };
    for (const ch of initialChanges) c[ch.status]++;
    return c;
  }, [initialChanges]);

  const visible = useMemo(() => {
    if (filter === "all") return initialChanges;
    return initialChanges.filter((c) => c.status === filter);
  }, [initialChanges, filter]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/pending-changes/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? `Failed to ${decision}`);
    } else {
      router.refresh();
    }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No {filter === "all" ? "" : filter} changes.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => {
            const isOpen = expanded.has(c.id);
            return (
              <div
                key={c.id}
                className="rounded-xl border border-gray-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  {isOpen ? (
                    <ChevronDown size={14} className="shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-gray-400" />
                  )}
                  <StatusBadge status={c.status} />
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-600">
                    {changeTypeLabel[c.change_type] ?? c.change_type}
                  </span>
                  <span className="flex-1 truncate text-sm text-gray-900">
                    {c.description}
                  </span>
                  <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                    by {displayName(c.requester ?? null)} ·{" "}
                    {formatDate(c.requested_at)}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 text-sm">
                    <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2">
                      <div>
                        <span className="text-gray-400">Requested by:</span>{" "}
                        {displayName(c.requester ?? null)}{" "}
                        {c.requester?.email && (
                          <span className="text-gray-400">
                            ({c.requester.email})
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-400">Requested at:</span>{" "}
                        {formatDate(c.requested_at)}
                      </div>
                      {c.target && (
                        <div>
                          <span className="text-gray-400">For employee:</span>{" "}
                          {displayName(c.target)}
                        </div>
                      )}
                      {c.decider && (
                        <div>
                          <span className="text-gray-400">Decided by:</span>{" "}
                          {displayName(c.decider)}
                          {c.decided_at && (
                            <span className="text-gray-400">
                              {" "}· {formatDate(c.decided_at)}
                            </span>
                          )}
                        </div>
                      )}
                      {c.applied_at && (
                        <div>
                          <span className="text-gray-400">Applied:</span>{" "}
                          {formatDate(c.applied_at)}
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      <PayloadPreview
                        changeType={c.change_type}
                        payload={c.payload}
                        currentDays={currentSchedules[c.target_employee_id ?? ""] ?? []}
                      />
                    </div>

                    {c.status === "pending" && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy === c.id}
                          onClick={() => decide(c.id, "approve")}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check size={12} /> Approve & apply
                        </button>
                        <button
                          type="button"
                          disabled={busy === c.id}
                          onClick={() => decide(c.id, "reject")}
                          className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">
        <Clock size={10} /> Pending
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-green-800">
        <CheckCircle2 size={10} /> Approved
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-700">
      <XCircle size={10} /> Rejected
    </span>
  );
}

function PayloadPreview({
  changeType,
  payload,
  currentDays = [],
}: {
  changeType: string;
  payload: Record<string, unknown>;
  currentDays?: ScheduleDay[];
}) {
  if (changeType === "bulk_import") {
    const rows = (payload?.rows as Array<Record<string, unknown>>) ?? [];
    const totalCells = rows.reduce((sum, r) => {
      const userPatch = (r.user_patch as Record<string, unknown>) ?? {};
      const customs = (r.custom_field_writes as unknown[]) ?? [];
      const mrs = (r.multi_row_writes as Array<{ data: Record<string, unknown> }>) ?? [];
      return (
        sum +
        Object.keys(userPatch).length +
        customs.length +
        mrs.reduce((s, m) => s + Object.keys(m.data ?? {}).length, 0)
      );
    }, 0);
    return (
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
        <p>
          <strong>{rows.length}</strong> employee{rows.length === 1 ? "" : "s"},{" "}
          <strong>{totalCells}</strong> cell{totalCells === 1 ? "" : "s"} to write
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            View raw payload
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-[10px]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      </div>
    );
  }
  if (changeType === "schedule_weekly_change") {
    const reqDays = (payload?.days as ScheduleDay[]) ?? [];
    const eff = payload?.effective_from as string | undefined;
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const hm = (t?: string) => (t || "").slice(0, 5);
    const fmt = (d?: ScheduleDay) =>
      !d
        ? "—"
        : d.is_rest_day
          ? "Rest day"
          : `${hm(d.start_time)} – ${hm(d.end_time)} · ${d.work_location === "online" ? "Online" : "Office"}`;
    const byDow = (arr: ScheduleDay[]) => {
      const m = new Map<number, ScheduleDay>();
      for (const d of arr) m.set(d.day_of_week, d);
      return m;
    };
    const curMap = byDow(currentDays);
    const reqMap = byDow(reqDays);
    const dows = [...new Set([...curMap.keys(), ...reqMap.keys()])].sort((a, b) => a - b);
    return (
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
        {eff && (
          <p className="mb-1.5 text-gray-500">
            Effective from <strong>{eff}</strong>
          </p>
        )}
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400">
              <th className="w-10 py-1 font-medium" />
              <th className="py-1 pr-3 font-medium">Current</th>
              <th className="py-1 font-medium">Requested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {dows.map((dow) => {
              const cur = curMap.get(dow);
              const req = reqMap.get(dow);
              const curStr = fmt(cur);
              const reqStr = fmt(req);
              const changed = req !== undefined && curStr !== reqStr;
              return (
                <tr key={dow} className={changed ? "bg-amber-50" : ""}>
                  <td className="w-10 py-1 pr-2 font-medium text-gray-600">
                    {dayNames[dow] ?? dow}
                  </td>
                  <td className="py-1 pr-3 text-gray-500">{curStr}</td>
                  <td className={`py-1 ${changed ? "font-semibold text-amber-800" : "text-gray-700"}`}>
                    {req === undefined ? (
                      <span className="text-gray-400">(unchanged)</span>
                    ) : (
                      reqStr
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {currentDays.length === 0 && (
          <p className="mt-1.5 text-[10px] text-gray-400">
            No current schedule on file for this employee.
          </p>
        )}
        <details className="mt-2">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            View raw payload
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-[10px]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  if (changeType === "field_value_upsert") {
    const value = payload?.value;
    return (
      <DetailBlock payload={payload}>
        {value === undefined || value === null || value === "" ? (
          <p className="text-gray-500">Sets an empty value.</p>
        ) : (
          <div className="whitespace-pre-wrap break-words text-gray-800">
            {String(value)}
          </div>
        )}
      </DetailBlock>
    );
  }

  if (changeType === "field_value_delete") {
    return (
      <DetailBlock payload={payload}>
        <p className="text-gray-500">Clears this field&apos;s value for the employee.</p>
      </DetailBlock>
    );
  }

  if (changeType === "multi_row_insert" || changeType === "multi_row_update") {
    const data = (payload?.data as Record<string, unknown>) ?? {};
    return (
      <DetailBlock payload={payload}>
        <KeyValueLines data={data} />
      </DetailBlock>
    );
  }

  if (changeType === "multi_row_delete") {
    return (
      <DetailBlock payload={payload}>
        <p className="text-gray-500">Removes this entry.</p>
      </DetailBlock>
    );
  }

  // Generic fallback: render whatever the payload holds as readable lines
  // instead of a raw JSON blob.
  return (
    <DetailBlock payload={payload}>
      <KeyValueLines data={payload} />
    </DetailBlock>
  );
}

/** Gray panel wrapping a friendly summary, with the raw payload tucked
 * behind a "View raw payload" disclosure for parity with the other views. */
function DetailBlock({
  payload,
  children,
}: {
  payload: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
      {children}
      <details className="mt-2">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
          View raw payload
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-[10px]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Renders an object as aligned label → value lines, recursing one level
 * into nested objects/arrays so nothing shows up as `{...}`. */
function KeyValueLines({ data }: { data: Record<string, unknown> }) {
  const SKIP = new Set(["field_id", "employee_id", "row_id"]);
  const entries = Object.entries(data ?? {}).filter(([k]) => !SKIP.has(k));
  if (entries.length === 0) {
    return <p className="text-gray-500">No additional details.</p>;
  }
  return (
    <dl className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="shrink-0 font-medium text-gray-500 sm:w-40">
            {humanizeKey(k)}
          </dt>
          <dd className="whitespace-pre-wrap break-words text-gray-800">
            {renderLeaf(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function renderLeaf(v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") {
    return <span className="text-gray-400">—</span>;
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    return v.length === 0 ? (
      <span className="text-gray-400">(none)</span>
    ) : (
      <ul className="list-disc pl-4">
        {v.map((item, i) => (
          <li key={i}>{renderLeaf(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object") {
    return (
      <div className="pl-2">
        <KeyValueLines data={v as Record<string, unknown>} />
      </div>
    );
  }
  return String(v);
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}
