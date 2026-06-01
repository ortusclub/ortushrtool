"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function CollapsibleSection({
  title,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown size={20} className="text-gray-500" />
          ) : (
            <ChevronRight size={20} className="text-gray-500" />
          )}
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        </button>
        {open && actions}
      </div>
      {open && <div className="space-y-4">{children}</div>}
    </section>
  );
}
