"use client";

import { useMemo, useState } from "react";
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
  parseISO,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { displayName } from "@/lib/utils";

export type CalendarLeave = {
  id: string;
  leave_type: string;
  leave_duration: "full_day" | "half_day";
  half_day_period: "am" | "pm" | null;
  start_date: string;
  end_date: string;
  status: "approved" | "pending" | "rejected";
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  reviewer: {
    full_name: string | null;
    preferred_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

export function TimeOffCalendar({ leaves }: { leaves: CalendarLeave[] }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<CalendarLeave[] | null>(null);

  const shift = (months: number) =>
    setCursor((prev) => addMonths(prev, months));

  const colorFor = (status: string) =>
    status === "approved"
      ? "bg-emerald-500 text-white"
      : status === "pending"
        ? "bg-amber-400 text-amber-900"
        : "bg-gray-300 text-gray-700";

  const days = useMemo(
    () => eachDayOfInterval({ start: cursor, end: endOfMonth(cursor) }),
    [cursor]
  );
  const firstDow = cursor.getDay();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-12)}
            title="Previous year"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => shift(-1)}
            title="Previous month"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
        <p className="text-sm font-medium text-gray-700">
          {format(cursor, "MMMM yyyy")}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(1)}
            title="Next month"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => shift(12)}
            title="Next year"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Approved
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
          Pending
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
          Rejected
        </span>
        {cursor.getTime() !== startOfMonth(new Date()).getTime() && (
          <button
            type="button"
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="ml-auto text-xs font-medium text-blue-600 hover:underline"
          >
            Jump to today
          </button>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1 text-center font-medium">
              {d}
            </div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`p${i}`} />
          ))}
          {days.map((d) => {
            // All leaves overlapping this day — a person can have more than
            // one (e.g. two half-days), so keep them all rather than the first.
            const dayLeaves = leaves.filter(
              (l) =>
                isWithinInterval(d, {
                  start: parseISO(l.start_date),
                  end: parseISO(l.end_date),
                }) || isSameDay(d, parseISO(l.start_date))
            );
            const base =
              "relative flex aspect-square items-center justify-center rounded text-xs";
            if (dayLeaves.length === 0) {
              return (
                <div key={d.toISOString()} className={`${base} text-gray-700`}>
                  {d.getDate()}
                </div>
              );
            }
            const primary = dayLeaves[0];
            const anyHalfDay = dayLeaves.some(
              (l) => l.leave_duration === "half_day"
            );
            const title = dayLeaves
              .map(
                (l) =>
                  `${LEAVE_TYPE_LABELS[l.leave_type] ?? l.leave_type} (${l.status})${
                    l.leave_duration === "half_day"
                      ? ` · half day${l.half_day_period ? ` (${l.half_day_period.toUpperCase()})` : ""}`
                      : ""
                  }`
              )
              .join("\n");
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelected(dayLeaves)}
                className={`${base} ${colorFor(primary.status)} hover:ring-2 hover:ring-blue-400`}
                title={`${title} — click for details`}
              >
                {d.getDate()}
                {dayLeaves.length > 1 ? (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white ring-1 ring-white">
                    {dayLeaves.length}
                  </span>
                ) : (
                  anyHalfDay && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold leading-none opacity-80">
                      ½
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <LeaveDetailModal
          leaves={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function LeaveDetailModal({
  leaves,
  onClose,
}: {
  leaves: CalendarLeave[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {leaves.length > 1
              ? `${leaves.length} leaves on this day`
              : "Leave details"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {leaves.map((leave, i) => (
            <div
              key={leave.id}
              className={i > 0 ? "border-t border-gray-100 pt-4" : ""}
            >
              <LeaveDetailBlock leave={leave} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LeaveDetailBlock({ leave }: { leave: CalendarLeave }) {
  const statusStyles: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    rejected: "bg-gray-200 text-gray-700",
  };
  const reviewerName = leave.reviewer ? displayName(leave.reviewer) : null;
  const sameDay = leave.start_date === leave.end_date;

  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-gray-900">
          {LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type}
        </p>
        <p className="text-xs text-gray-500">
          {sameDay
            ? format(parseISO(leave.start_date), "MMM d, yyyy")
            : `${format(parseISO(leave.start_date), "MMM d, yyyy")} – ${format(parseISO(leave.end_date), "MMM d, yyyy")}`}
          {leave.leave_duration === "half_day" &&
            ` · half day${leave.half_day_period ? ` (${leave.half_day_period.toUpperCase()})` : ""}`}
        </p>
      </div>

      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[leave.status]}`}
      >
        {leave.status}
      </span>

      <dl className="mt-3 space-y-2 text-xs">
        <Row label="Filed">
          {format(parseISO(leave.created_at), "MMM d, yyyy 'at' h:mm a")}
        </Row>
        {leave.reason && <Row label="Reason">{leave.reason}</Row>}
        {leave.status !== "pending" && reviewerName && (
          <Row label={leave.status === "approved" ? "Approved by" : "Rejected by"}>
            {reviewerName}
            {leave.reviewed_at && (
              <span className="text-gray-400">
                {" "}· {format(parseISO(leave.reviewed_at), "MMM d, yyyy")}
              </span>
            )}
          </Row>
        )}
        {leave.reviewer_notes && (
          <Row label="Reviewer note">
            <span className="italic">{leave.reviewer_notes}</span>
          </Row>
        )}
      </dl>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-gray-900">{children}</dd>
    </div>
  );
}
