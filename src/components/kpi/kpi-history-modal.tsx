"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { KPI_UNIT_TYPES } from "@/lib/constants";
import type { KpiAssignmentWithDetails } from "@/types/database";
import { X } from "lucide-react";

interface HistoryEntry {
  id: string;
  old_value: number;
  new_value: number;
  notes: string | null;
  created_at: string;
  updated_by_user: { full_name: string; email: string } | null;
}

interface Props {
  assignment: KpiAssignmentWithDetails;
  onClose: () => void;
}

export function KpiHistoryModal({ assignment, onClose }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const def = assignment.kpi_definition;
  const unitSuffix =
    def?.unit_label ||
    (def ? KPI_UNIT_TYPES[def.unit_type].suffix : "");

  useEffect(() => {
    async function fetchHistory() {
      const supabase = createClient();
      const { data } = await supabase
        .from("kpi_updates")
        .select(
          "id, old_value, new_value, notes, created_at, updated_by_user:users!kpi_updates_updated_by_fkey(full_name, email)"
        )
        .eq("kpi_assignment_id", assignment.id)
        .order("created_at", { ascending: false });

      const entries: HistoryEntry[] = (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        updated_by_user: Array.isArray(row.updated_by_user)
          ? row.updated_by_user[0] ?? null
          : row.updated_by_user ?? null,
      })) as HistoryEntry[];
      setHistory(entries);
      setLoading(false);
    }
    fetchHistory();
  }, [assignment.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Update History
            </h2>
            <p className="text-sm text-gray-500">{def?.name || "KPI"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            No updates recorded yet.
          </div>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {entry.old_value}
                    {unitSuffix ? ` ${unitSuffix}` : ""} → {entry.new_value}
                    {unitSuffix ? ` ${unitSuffix}` : ""}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  by{" "}
                  {entry.updated_by_user?.full_name ||
                    entry.updated_by_user?.email ||
                    "Unknown"}
                </p>
                {entry.notes && (
                  <p className="mt-1 text-sm text-gray-700">{entry.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
