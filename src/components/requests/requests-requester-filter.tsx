"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

interface Props {
  /** URL query param this search writes to (e.g. "req_leave"). */
  param: string;
  /** Context word used in the placeholder, e.g. "leave". */
  label: string;
  initial: string;
}

export function RequestsRequesterSearch({ param, label, initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const skip = useRef(true);

  // Debounce URL writes so we don't re-render the server tree on every
  // keystroke; the page filters server-side off this param.
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      const v = value.trim();
      if (v) params.set(param, v);
      else params.delete(param);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [value, param, pathname, router]);

  return (
    <div className="relative w-64">
      <Search
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Search ${label} by requester…`}
        className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
