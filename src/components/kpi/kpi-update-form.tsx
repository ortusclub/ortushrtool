"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { KPI_UNIT_TYPES } from "@/lib/constants";
import type { KpiAssignmentWithDetails } from "@/types/database";
import { X } from "lucide-react";

interface Props {
  assignment: KpiAssignmentWithDetails;
  onClose: () => void;
}

export function KpiUpdateForm({ assignment, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newValue, setNewValue] = useState(
    assignment.current_value.toString()
  );
  const [notes, setNotes] = useState("");

  const def = assignment.kpi_definition;
  const unitSuffix =
    def?.unit_label ||
    (def ? KPI_UNIT_TYPES[def.unit_type].suffix : "");
  const progress =
    assignment.target_value > 0
      ? Math.round(
          (assignment.current_value / assignment.target_value) * 100
        )
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedValue = parseFloat(newValue);
    if (isNaN(parsedValue)) {
      setError("Please enter a valid number");
      return;
    }
    if (parsedValue === assignment.current_value && !notes.trim()) {
      setError("Value unchanged. Add a note or change the value.");
      return;
    }
    if (!notes.trim()) {
      setError("Please add a note explaining this update");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Optimistic concurrency: only update if current_value hasn't changed
    const { data: updated, error: updateError } = await supabase
      .from("kpi_assignments")
      .update({ current_value: parsedValue })
      .eq("id", assignment.id)
      .eq("current_value", assignment.current_value)
      .select("id")
      .single();

    if (updateError || !updated) {
      setError(
        "This KPI was updated by someone else. Please refresh and try again."
      );
      setLoading(false);
      return;
    }

    // Insert audit trail
    await supabase.from("kpi_updates").insert({
      kpi_assignment_id: assignment.id,
      updated_by: user!.id,
      old_value: assignment.current_value,
      new_value: parsedValue,
      notes: notes.trim(),
    });

    router.refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Update KPI Progress
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-gray-50 p-4">
          <p className="font-medium text-gray-900">
            {def?.name || "KPI"}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 flex-1 rounded-full bg-gray-200">
              <div
                className={`h-2 rounded-full ${
                  progress >= 80
                    ? "bg-green-500"
                    : progress >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-600">
              {progress}%
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Current: {assignment.current_value}
            {unitSuffix ? ` ${unitSuffix}` : ""} / Target:{" "}
            {assignment.target_value}
            {unitSuffix ? ` ${unitSuffix}` : ""}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              New Value
            </label>
            <input
              type="number"
              step="any"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes <span className="text-red-500">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain what changed..."
              rows={3}
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
              {loading ? "Updating..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
