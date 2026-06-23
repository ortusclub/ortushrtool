"use client";

import { useMemo, useState } from "react";
import { CalendarRange, X } from "lucide-react";

export type ReceivedFeedbackItem = {
  id: string;
  department: string;
  targetName: string | null;
  subject: string;
  message: string;
  hrNotes: string | null;
  /** ISO timestamp of when HR forwarded it. */
  forwardedAt: string | null;
};

function formatDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReceivedFeedbackList({
  items,
}: {
  items: ReceivedFeedbackItem[];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [name, setName] = useState("");

  const names = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.targetName).filter(Boolean))
      ).sort() as string[],
    [items]
  );

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const day = it.forwardedAt ? it.forwardedAt.slice(0, 10) : "";
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (name && it.targetName !== name) return false;
      return true;
    });
  }, [items, from, to, name]);

  const dateInput =
    "rounded-lg border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs dark:border-gray-700 dark:bg-gray-800">
        <CalendarRange size={14} className="text-gray-500" />
        <span className="font-medium text-gray-700 dark:text-gray-200">
          Forwarded between
        </span>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          className={dateInput}
          aria-label="From date"
        />
        <span className="text-gray-400">–</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className={dateInput}
          aria-label="To date"
        />
        {names.length > 0 && (
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={dateInput}
            aria-label="Filter by name"
          >
            <option value="">All names</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        {(from || to || name) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setName("");
            }}
            className="ml-1 inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <X size={12} /> Clear
          </button>
        )}
        <span className="ml-auto text-gray-400">
          {filtered.length} of {items.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          {items.length === 0
            ? "No feedback has been forwarded to you yet."
            : "No feedback in this date range."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                  {f.department}
                  {f.targetName ? ` · ${f.targetName}` : ""}
                </span>
                {f.forwardedAt && (
                  <span className="text-gray-400">
                    forwarded {formatDay(f.forwardedAt)}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {f.subject}
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {f.message}
              </p>
              {f.hrNotes && (
                <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">
                  <strong>Note from HR:</strong> {f.hrNotes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
