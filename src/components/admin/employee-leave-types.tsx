"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { LEAVE_TYPES, ACTIVATABLE_LEAVE_TYPES } from "@/lib/constants";
import type { User, LeavePlan } from "@/types/database";
import { displayName } from "@/lib/utils";

interface Props {
  user: User;
  onClose: () => void;
}

interface PlanWithName {
  id: string;
  plan_id: string;
  plan_name: string;
}

export function EmployeeLeaveTypesModal({ user, onClose }: Props) {
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [assignedPlans, setAssignedPlans] = useState<PlanWithName[]>([]);
  const [allPlans, setAllPlans] = useState<LeavePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addingPlan, setAddingPlan] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: leaveTypes }, { data: empPlans }, { data: plans }] = await Promise.all([
        supabase
          .from("employee_leave_types")
          .select("leave_type")
          .eq("employee_id", user.id),
        supabase
          .from("employee_leave_plans")
          .select("id, plan_id, plan:leave_plans!employee_leave_plans_plan_id_fkey(name)")
          .eq("employee_id", user.id),
        supabase
          .from("leave_plans")
          .select("*")
          .order("name"),
      ]);

      setActivated(new Set((leaveTypes ?? []).map((d) => d.leave_type)));
      setAssignedPlans(
        (empPlans ?? []).map((ep: any) => ({
          id: ep.id,
          plan_id: ep.plan_id,
          plan_name: ep.plan?.name ?? "Unknown",
        }))
      );
      setAllPlans(plans ?? []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  const toggleLeaveType = async (leaveType: string) => {
    setSaving(leaveType);
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (activated.has(leaveType)) {
      await supabase
        .from("employee_leave_types")
        .delete()
        .eq("employee_id", user.id)
        .eq("leave_type", leaveType);

      setActivated((prev) => {
        const next = new Set(prev);
        next.delete(leaveType);
        return next;
      });
    } else {
      await supabase.from("employee_leave_types").insert({
        employee_id: user.id,
        leave_type: leaveType,
        activated_by: authUser?.id ?? null,
      });

      setActivated((prev) => new Set([...prev, leaveType]));
    }

    setSaving(null);
  };

  const assignPlan = async () => {
    if (!selectedPlanId) return;
    setSaving("plan-add");
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("employee_leave_plans")
      .insert({
        employee_id: user.id,
        plan_id: selectedPlanId,
        assigned_by: authUser?.id ?? null,
      })
      .select("id, plan_id")
      .single();

    if (!error && data) {
      const plan = allPlans.find((p) => p.id === selectedPlanId);
      setAssignedPlans((prev) => [
        ...prev,
        { id: data.id, plan_id: data.plan_id, plan_name: plan?.name ?? "Unknown" },
      ]);
    }

    setSelectedPlanId("");
    setAddingPlan(false);
    setSaving(null);
  };

  const removePlan = async (empPlanId: string) => {
    setSaving(`remove-${empPlanId}`);
    const supabase = createClient();
    await supabase.from("employee_leave_plans").delete().eq("id", empPlanId);
    setAssignedPlans((prev) => prev.filter((p) => p.id !== empPlanId));
    setSaving(null);
  };

  const unassignedPlans = allPlans.filter(
    (p) => !assignedPlans.some((ap) => ap.plan_id === p.id)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Leave Configuration
            </h3>
            <p className="text-sm text-gray-500">{displayName(user)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Assigned Leave Plans */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Assigned Leave Plans
              </p>
              {assignedPlans.length === 0 ? (
                <p className="text-sm text-gray-400 mb-2">No plans assigned yet.</p>
              ) : (
                <div className="space-y-2 mb-2">
                  {assignedPlans.map((ap) => (
                    <div
                      key={ap.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-2.5"
                    >
                      <span className="text-sm font-medium text-gray-700">{ap.plan_name}</span>
                      <button
                        onClick={() => removePlan(ap.id)}
                        disabled={saving === `remove-${ap.id}`}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Remove plan"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {addingPlan ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select a plan...</option>
                    {unassignedPlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={assignPlan}
                    disabled={!selectedPlanId || saving === "plan-add"}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving === "plan-add" ? "..." : "Add"}
                  </button>
                  <button
                    onClick={() => { setAddingPlan(false); setSelectedPlanId(""); }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                unassignedPlans.length > 0 && (
                  <button
                    onClick={() => setAddingPlan(true)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                  >
                    <Plus size={14} />
                    Add Plan
                  </button>
                )
              )}
            </div>

            {/* Special Leave Type Activation */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Special Leave Types
              </p>
              <div className="space-y-2">
                {ACTIVATABLE_LEAVE_TYPES.map((key) => {
                  const info = LEAVE_TYPES[key as keyof typeof LEAVE_TYPES];
                  const isActive = activated.has(key);
                  const isSaving = saving === key;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-2.5"
                    >
                      <span className="text-sm text-gray-700">{info.label}</span>
                      <button
                        onClick={() => toggleLeaveType(key)}
                        disabled={isSaving}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          isActive
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-green-50 text-green-600 hover:bg-green-100"
                        }`}
                      >
                        {isSaving ? "..." : isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Universal types (read-only) */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Standard Leave Types (always available)
              </p>
              <div className="space-y-2">
                {Object.entries(LEAVE_TYPES)
                  .filter(([, v]) => v.universal)
                  .map(([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5"
                    >
                      <span className="text-sm text-gray-700">{val.label}</span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
