"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { KPI_PERIOD_TYPES } from "@/lib/constants";
import type { KpiDefinition, KpiPeriodType } from "@/types/database";
import { addMonths, endOfMonth, format } from "date-fns";
import { X } from "lucide-react";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
}

interface Props {
  definitions: KpiDefinition[];
  teamMembers: TeamMember[];
  onClose: () => void;
}

function calculatePeriodEnd(
  periodStart: string,
  periodType: KpiPeriodType
): string {
  const start = new Date(periodStart + "T00:00:00");
  switch (periodType) {
    case "monthly":
      return format(endOfMonth(start), "yyyy-MM-dd");
    case "quarterly":
      return format(
        endOfMonth(addMonths(start, 2)),
        "yyyy-MM-dd"
      );
    case "yearly":
      return format(
        endOfMonth(addMonths(start, 11)),
        "yyyy-MM-dd"
      );
  }
}

export function KpiAssignForm({ definitions, teamMembers, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [definitionId, setDefinitionId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [periodType, setPeriodType] = useState<KpiPeriodType>("monthly");
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return format(d, "yyyy-MM-dd");
  });
  const [targetValue, setTargetValue] = useState("");
  const [notes, setNotes] = useState("");

  const periodEnd = calculatePeriodEnd(periodStart, periodType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!definitionId || !employeeId || !targetValue) {
      setError("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase
      .from("kpi_assignments")
      .insert({
        kpi_definition_id: definitionId,
        employee_id: employeeId,
        assigned_by: user!.id,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        target_value: parseFloat(targetValue),
        notes: notes.trim() || null,
      });

    if (insertError) {
      if (insertError.code === "23505") {
        setError(
          "This KPI is already assigned to this employee for this period"
        );
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    router.refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Assign KPI</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              KPI
            </label>
            <select
              value={definitionId}
              onChange={(e) => setDefinitionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select a KPI...</option>
              {definitions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Employee
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select an employee...</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Period Type
              </label>
              <select
                value={periodType}
                onChange={(e) =>
                  setPeriodType(e.target.value as KpiPeriodType)
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(KPI_PERIOD_TYPES).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Period Start
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Period: {periodStart} to {periodEnd}
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Target Value
            </label>
            <input
              type="number"
              step="any"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g. 100"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes{" "}
              <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context for this KPI assignment"
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Assigning..." : "Assign KPI"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
