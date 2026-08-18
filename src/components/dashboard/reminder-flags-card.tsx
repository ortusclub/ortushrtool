"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Check } from "lucide-react";

export type ReminderFlag = {
  id: string;
  kindLabel: string;
  employeeName: string;
  summary: string;
  daysPending: number;
};

/**
 * "Waiting on you" card — the in-app half of the pending-approval reminder.
 * Shows the requests this viewer is holding up, oldest first, each with a
 * dismiss button that also drops it from the daily reminder email.
 */
export function ReminderFlagsCard({ flags }: { flags: ReminderFlag[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const visible = flags.filter((f) => !dismissed.has(f.id));
  if (visible.length === 0) return null;

  const dismiss = async (id: string) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/request-reminders/${id}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not dismiss that reminder.");
        return;
      }
      setDismissed((prev) => new Set(prev).add(id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 shadow-sm sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-orange-800">Waiting On You</p>
          <p className="mt-1 text-3xl font-bold text-orange-900">
            {visible.length}
          </p>
          <p className="mt-1 text-xs text-orange-700">
            Pending longer than the reminder threshold
          </p>
        </div>
        <div className="rounded-lg bg-orange-100 p-3">
          <AlarmClock className="text-orange-600" size={24} />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {visible.slice(0, 5).map((f) => (
          <li
            key={f.id}
            className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">
                {f.employeeName}
                <span className="ml-2 font-normal text-gray-500">
                  {f.kindLabel}
                </span>
              </p>
              <p className="truncate text-xs text-gray-600">{f.summary}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="whitespace-nowrap text-xs text-orange-700">
                {f.daysPending} day{f.daysPending !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => dismiss(f.id)}
                disabled={busyId === f.id}
                title="Dismiss this reminder (stops the daily email for it)"
                className="rounded-md border border-gray-300 bg-white p-1 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
              >
                <Check size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {visible.length > 5 && (
        <p className="mt-2 text-xs text-orange-700">
          +{visible.length - 5} more
        </p>
      )}

      <Link
        href="/requests"
        className="mt-3 inline-block text-sm font-medium text-orange-800 underline underline-offset-2 hover:text-orange-900"
      >
        Review all requests
      </Link>
    </div>
  );
}
