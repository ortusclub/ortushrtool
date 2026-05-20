"use client";

import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: SortDir | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Sort by ${label}`}
      className={cn(
        "ml-1 inline-flex items-center rounded p-1 align-middle hover:bg-gray-200",
        active && "bg-blue-100 text-blue-700 hover:bg-blue-200"
      )}
    >
      {active === "asc" ? (
        <ArrowUp size={12} />
      ) : active === "desc" ? (
        <ArrowDown size={12} />
      ) : (
        <ArrowUpDown size={12} />
      )}
    </button>
  );
}

/**
 * Helper for column-cycling sort state.
 * Click order: null -> asc -> desc -> null. Clicking a different column
 * resets to asc on that column.
 */
export function useSortCycle<TColumn extends string>() {
  // Returned as a plain function so consumers can keep their own state.
  return function cycle(
    prev: { column: TColumn; dir: SortDir } | null,
    column: TColumn
  ): { column: TColumn; dir: SortDir } | null {
    if (!prev || prev.column !== column) return { column, dir: "asc" };
    if (prev.dir === "asc") return { column, dir: "desc" };
    return null;
  };
}
