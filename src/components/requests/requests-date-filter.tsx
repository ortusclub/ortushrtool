"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";

export function RequestsDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clear() {
    router.replace(pathname);
  }

  const hasFilter = from || to;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-gray-600">Filter by date:</span>
      <input
        type="date"
        value={from}
        onChange={(e) => update("from", e.target.value)}
        max={to || undefined}
        placeholder="From"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <span className="text-sm text-gray-400">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => update("to", e.target.value)}
        min={from || undefined}
        placeholder="To"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {hasFilter && (
        <button
          onClick={clear}
          className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
        >
          <X size={13} /> Clear
        </button>
      )}
    </div>
  );
}
