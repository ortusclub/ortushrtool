"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Copy, RefreshCw, Trash2, Check, AlertTriangle } from "lucide-react";
import { hasRole } from "@/lib/utils";
import {
  HOLIDAY_COUNTRY_LABELS,
  type HolidayCountry,
  type UserRole,
} from "@/types/database";

type Scope =
  | "me"
  | "my_team"
  | "direct_reports"
  | "all_reports"
  | "department"
  | "company";

type EventType =
  | "birthdays"
  | "anniversaries"
  | "leaves"
  | "adjustments"
  | "overtime"
  | "holiday_work"
  | "holidays";

const SCOPES: { value: Scope; label: string; minRole: UserRole }[] = [
  { value: "me", label: "Just me", minRole: "employee" },
  { value: "my_team", label: "My team (peers + manager)", minRole: "employee" },
  { value: "direct_reports", label: "My direct reports", minRole: "manager" },
  { value: "all_reports", label: "My direct + indirect reports", minRole: "manager" },
  { value: "department", label: "My department", minRole: "employee" },
  { value: "company", label: "Whole company", minRole: "employee" },
];

const EVENT_TYPES: {
  value: EventType;
  label: string;
  description: string;
  /** Scopes that don't make sense for this type — e.g. holidays are global. */
  fixedScope?: Scope;
}[] = [
  { value: "birthdays", label: "Birthdays", description: "Recurring yearly." },
  { value: "anniversaries", label: "Work anniversaries", description: "Recurring yearly." },
  { value: "leaves", label: "Approved leaves", description: "Full-day and half-day." },
  { value: "adjustments", label: "Approved schedule adjustments", description: "Timed events on the requested date." },
  { value: "overtime", label: "Approved overtime", description: "Timed events." },
  { value: "holiday_work", label: "Approved holiday work", description: "Timed events on the holiday." },
  {
    value: "holidays",
    label: "Holidays",
    description: "Pick a country (or all countries).",
    fixedScope: "me", // people-scope is ignored for holidays; use "me" for a clean URL
  },
];

const COUNTRY_OPTIONS = Object.keys(HOLIDAY_COUNTRY_LABELS) as HolidayCountry[];

export function CalendarSyncForm({
  initialToken,
  appUrl,
  userRole,
  defaultCountry,
}: {
  initialToken: string | null;
  appUrl: string;
  userRole: UserRole;
  defaultCountry: HolidayCountry;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<EventType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scopePerType, setScopePerType] = useState<Record<EventType, Scope>>({
    birthdays: "me",
    anniversaries: "me",
    leaves: "me",
    adjustments: "me",
    overtime: "me",
    holiday_work: "me",
    holidays: "me",
  });
  const [holidayCountry, setHolidayCountry] = useState<HolidayCountry | "all">(
    defaultCountry
  );

  const availableScopes = SCOPES.filter((s) => hasRole(userRole, s.minRole));

  const setScope = (type: EventType, scope: Scope) => {
    setScopePerType((prev) => ({ ...prev, [type]: scope }));
  };

  const generate = async () => {
    // When a token already exists this is a *regeneration*, which overwrites the
    // single shared token — every calendar already subscribed with the current
    // URL stops updating until re-added. Warn before doing that. (First-time
    // generation, when there's no token yet, needs no confirmation.)
    if (
      token &&
      !confirm(
        "Regenerate your calendar token?\n\nThis replaces your current token, so every calendar you've already subscribed (Google, Apple, etc.) will STOP updating. You'll have to remove and re-add each one using the new URL."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/calendar/token", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to generate token");
    } else {
      setToken(data.token);
      setMessage(
        "New calendar token generated. Any existing subscriptions stop working."
      );
    }
    setBusy(false);
    router.refresh();
  };

  const revoke = async () => {
    if (
      !confirm(
        "Revoke this calendar token? Any active Google Calendar subscriptions will stop receiving updates."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/calendar/token", { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Failed to revoke token");
    } else {
      setToken(null);
      setMessage("Calendar token revoked.");
    }
    setBusy(false);
    router.refresh();
  };

  const urlFor = (type: EventType): string => {
    const def = EVENT_TYPES.find((t) => t.value === type)!;
    const scope = def.fixedScope ?? scopePerType[type];
    const base = `${appUrl}/api/calendar/feed?token=${token}&scope=${scope}&types=${type}`;
    if (type === "holidays") {
      return `${base}&country=${holidayCountry}`;
    }
    return base;
  };

  const copy = async (type: EventType) => {
    try {
      await navigator.clipboard.writeText(urlFor(type));
      setCopied(type);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">How it works</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Generate your personal calendar token below.</li>
          <li>
            For each calendar you want, pick the scope (e.g. <em>my team</em>,{" "}
            <em>whole company</em>) and copy the URL.
          </li>
          <li>
            In Google Calendar, click <strong>Other calendars +</strong> →{" "}
            <strong>From URL</strong> → paste → <strong>Add calendar</strong>.
          </li>
          <li>
            Each subscription becomes its own calendar in Google — you can
            color-code them and hide any individually.
          </li>
          <li>Google polls feeds every 12–24 hours, so updates aren&apos;t instant.</li>
        </ol>
      </div>

      {!token ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-gray-500" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">No calendar token yet</p>
              <p className="text-sm text-gray-500">
                Generate one to start subscribing in Google Calendar.
              </p>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Generating..." : "Generate token"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
            <Calendar size={16} className="text-gray-500" />
            <span className="text-gray-700">
              Calendar token active.{" "}
              <span className="text-xs text-gray-400">
                Tokens grant read-only access to your calendar feeds.
              </span>
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={12} /> Regenerate
              </button>
              <button
                type="button"
                onClick={revoke}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={12} /> Revoke
              </button>
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Regenerating or revoking your token breaks every calendar
              you&apos;ve already subscribed.</strong> They all share this one
              token, so any calendar added with the current URL will silently
              stop updating until you remove it and re-add it with the new URL.
            </span>
          </p>

          <div className="space-y-3">
            {EVENT_TYPES.map((t) => (
              <div
                key={t.value}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{t.label}</p>
                    <p className="text-xs text-gray-500">{t.description}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                  {t.value === "holidays" ? (
                    <select
                      value={holidayCountry}
                      onChange={(e) =>
                        setHolidayCountry(
                          e.target.value as HolidayCountry | "all"
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                    >
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {HOLIDAY_COUNTRY_LABELS[c]}
                        </option>
                      ))}
                      <option value="all">All countries</option>
                    </select>
                  ) : t.fixedScope ? (
                    <div className="text-xs text-gray-500">Country-wide</div>
                  ) : (
                    <select
                      value={scopePerType[t.value]}
                      onChange={(e) =>
                        setScope(t.value, e.target.value as Scope)
                      }
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                    >
                      {availableScopes.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <code className="truncate rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    {urlFor(t.value)}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(t.value)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {copied === t.value ? (
                      <>
                        <Check size={12} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {message && (
        <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
          {message}
        </div>
      )}
    </div>
  );
}
