"use client";

import { useState, useRef, useEffect } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export function HeaderFilter({
  label,
  options,
  selected,
  onChange,
  align = "left",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  align?: "left" | "right" | "center";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  const active = selected.size > 0;
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Filter ${label}`}
        className={cn(
          "ml-1 inline-flex items-center rounded p-1 align-middle hover:bg-gray-200",
          active && "bg-blue-100 text-blue-700 hover:bg-blue-200"
        )}
      >
        <Filter size={12} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-30 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg",
            align === "right" && "right-0",
            align === "center" && "left-1/2 -translate-x-1/2"
          )}
        >
          <div className="max-h-60 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2 py-1 text-xs text-gray-400">No options</p>
            ) : (
              options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>
          {active && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-50"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
