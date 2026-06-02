"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { LedgerEntry } from "@/lib/leave-ledger";

interface Props {
  label: string;
  available: number;
  usedDays: number;
  usedCount: number;
  entries: LedgerEntry[];
}

export function LeaveBalanceCard({ label, available, usedDays, entries }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
      >
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <div className="mt-2 flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${available < 0 ? "text-red-600" : "text-gray-900"}`}>
            {available}
          </span>
          <span className="text-xs text-gray-500">available</span>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          {usedDays} day{usedDays === 1 ? "" : "s"} used · tap for history
        </p>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{label} — history</h3>
                <p className="text-xs text-gray-500">This cycle&apos;s add/subtract activity</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
              {entries.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-gray-500">No activity this cycle.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-5 py-2.5 text-xs text-gray-500">
                          {format(parseISO(e.date), "MMM d")}
                        </td>
                        <td className="px-2 py-2.5 text-gray-700">{e.label}</td>
                        <td
                          className={`whitespace-nowrap px-2 py-2.5 text-right font-medium ${
                            e.delta < 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {e.delta > 0 ? "+" : ""}
                          {e.delta}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right font-semibold text-gray-900">
                          {e.running}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-3">
              <span className="text-xs text-gray-500">
                {usedDays} day{usedDays === 1 ? "" : "s"} used
              </span>
              <span className="text-sm font-semibold text-gray-900">
                Available: {available}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
