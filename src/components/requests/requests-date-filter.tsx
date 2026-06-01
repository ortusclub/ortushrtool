"use client";

import { useRouter, usePathname } from "next/navigation";
import { X } from "lucide-react";

interface Props {
  from: string;
  to: string;
}

export function RequestsDateFilter({ from, to }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function update(key: string, value: string) {
    const params = new URLSearchParams();
    if (key !== "from" && from) params.set("from", from);
    if (key !== "to" && to) params.set("to", to);
    if (value) params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
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
        defaultValue={from}
        onChange={(e) => update("from", e.target.value)}
        max={to || undefined}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <span className="text-sm text-gray-400">to</span>
      <input
        type="date"
        defaultValue={to}
        onChange={(e) => update("to", e.target.value)}
        min={from || undefined}
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
