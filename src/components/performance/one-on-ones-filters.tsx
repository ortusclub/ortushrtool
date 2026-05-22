"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, X } from "lucide-react";
import { FilterCombobox } from "@/components/performance/filter-combobox";
import { HOLIDAY_COUNTRY_LABELS, type HolidayCountry } from "@/types/database";

export function OneOnOnesFilters({
  subjects,
  hosts,
  departments,
  countries,
  isAdmin,
}: {
  subjects: Array<{ id: string; label: string }>;
  hosts: Array<{ id: string; label: string }>;
  departments: string[];
  countries: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`?${next.toString()}`);
  };

  const clear = () => router.push("?");

  const hasFilters = Array.from(params.keys()).some((k) =>
    ["subject", "host", "dept", "country", "from", "to"].includes(k)
  );

  const exportUrl = `/api/one-on-ones/export?${params.toString()}`;

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-gray-400" />
        <FilterCombobox
          options={subjects.map((s) => ({ value: s.id, label: s.label }))}
          value={params.get("subject") ?? ""}
          onChange={(v) => update("subject", v)}
          placeholder="Search subject…"
        />
        <FilterCombobox
          options={hosts.map((h) => ({ value: h.id, label: h.label }))}
          value={params.get("host") ?? ""}
          onChange={(v) => update("host", v)}
          placeholder="Search host…"
        />
        {departments.length > 0 && (
          <FilterCombobox
            options={departments.map((d) => ({ value: d, label: d }))}
            value={params.get("dept") ?? ""}
            onChange={(v) => update("dept", v)}
            placeholder="Search department…"
          />
        )}
        {countries.length > 0 && (
          <FilterCombobox
            options={countries.map((c) => ({
              value: c,
              label:
                HOLIDAY_COUNTRY_LABELS[c as HolidayCountry] ?? c,
            }))}
            value={params.get("country") ?? ""}
            onChange={(v) => update("country", v)}
            placeholder="Search country…"
          />
        )}
        <input
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => update("from", e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          placeholder="From"
        />
        <input
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => update("to", e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          placeholder="To"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <X size={12} /> Clear
          </button>
        )}
        {isAdmin && (
          <a
            href={exportUrl}
            className="ml-auto flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            title="Export visible 1-on-1s as CSV"
          >
            <Download size={12} /> CSV (shared notes)
          </a>
        )}
        {isAdmin && (
          <a
            href={`${exportUrl}${exportUrl.includes("?") ? "&" : "?"}include_private=1`}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            title="Export with private notes — handle carefully"
          >
            <Download size={12} /> CSV (incl. private)
          </a>
        )}
      </div>
    </div>
  );
}
