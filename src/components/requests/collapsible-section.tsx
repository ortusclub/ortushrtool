"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Accent = "indigo" | "emerald" | "amber";

const DOT: Record<Accent, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

export function CollapsibleSection({
  title,
  defaultOpen = true,
  accent = "indigo",
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  accent?: Accent;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-gray-300 bg-gray-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown size={22} className="text-gray-400" />
          ) : (
            <ChevronRight size={22} className="text-gray-400" />
          )}
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[accent]}`} />
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        </button>
        {open && actions}
      </div>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </section>
  );
}
