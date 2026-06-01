"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function CollapsibleHistory({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-6 py-4 text-left"
      >
        {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
        <h2 className="text-lg font-semibold text-gray-900">
          History {count > 0 && <span className="ml-1 text-sm font-normal text-gray-400">({count})</span>}
        </h2>
      </button>
      {open && <div className="border-t border-gray-200">{children}</div>}
    </div>
  );
}
