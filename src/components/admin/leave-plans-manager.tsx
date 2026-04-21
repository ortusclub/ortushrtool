"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, Pencil } from "lucide-react";
import { LEAVE_TYPES } from "@/lib/constants";
import type { LeavePlan, LeavePlanAllocation, GrantType } from "@/types/database";

interface Props {
  initialPlans: LeavePlan[];
  initialAllocations: LeavePlanAllocation[];
}

const ALL_LEAVE_TYPE_KEYS = Object.keys(LEAVE_TYPES);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function LeavePlansManager({ initialPlans, initialAllocations }: Props) {
  const router = useRouter();
  const [plans, setPlans] = useState(initialPlans);
  const [allocations, setAllocations] = useState(initialAllocations);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanDesc, setNewPlanDesc] = useState("");
  const [newGrantType, setNewGrantType] = useState<GrantType>("custom");
  const [newRenewalMonth, setNewRenewalMonth] = useState(1);
  const [newRenewalDay, setNewRenewalDay] = useState(1);
  const [newAllocations, setNewAllocations] = useState<Record<string, number>>(
    Object.fromEntries(ALL_LEAVE_TYPE_KEYS.map((k) => [k, 0]))
  );
  const [editAllocations, setEditAllocations] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const getAllocationsForPlan = (planId: string) => {
    const planAllocs = allocations.filter((a) => a.plan_id === planId);
    const map: Record<string, number> = {};
    for (const a of planAllocs) {
      map[a.leave_type] = a.days_per_year;
    }
    return map;
  };

  const handleCreate = async () => {
    if (!newPlanName.trim()) return;
    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { data: plan, error } = await supabase
      .from("leave_plans")
      .insert({
        name: newPlanName.trim(),
        description: newPlanDesc.trim() || null,
        grant_type: newGrantType,
        renewal_month: newRenewalMonth,
        renewal_day: newRenewalDay,
      })
      .select()
      .single();

    if (error || !plan) {
      setMessage(error?.message ?? "Failed to create plan");
      setSaving(false);
      return;
    }

    // Insert allocations
    const allocsToInsert = ALL_LEAVE_TYPE_KEYS
      .filter((k) => (newAllocations[k] ?? 0) > 0)
      .map((k) => ({
        plan_id: plan.id,
        leave_type: k,
        days_per_year: newAllocations[k],
      }));

    if (allocsToInsert.length > 0) {
      await supabase.from("leave_plan_allocations").insert(allocsToInsert);
    }

    setShowCreate(false);
    setNewPlanName("");
    setNewPlanDesc("");
    setNewGrantType("custom");
    setNewRenewalMonth(1);
    setNewRenewalDay(1);
    setNewAllocations(Object.fromEntries(ALL_LEAVE_TYPE_KEYS.map((k) => [k, 0])));
    setSaving(false);
    router.refresh();
  };

  const startEdit = (plan: LeavePlan) => {
    setEditingPlanId(plan.id);
    const current = getAllocationsForPlan(plan.id);
    const full: Record<string, number> = {};
    for (const k of ALL_LEAVE_TYPE_KEYS) {
      full[k] = current[k] ?? 0;
    }
    setEditAllocations(full);
  };

  const saveEdit = async (planId: string) => {
    setSaving(true);
    const supabase = createClient();

    // Delete existing allocations for this plan
    await supabase.from("leave_plan_allocations").delete().eq("plan_id", planId);

    // Insert updated allocations
    const allocsToInsert = ALL_LEAVE_TYPE_KEYS
      .filter((k) => (editAllocations[k] ?? 0) > 0)
      .map((k) => ({
        plan_id: planId,
        leave_type: k,
        days_per_year: editAllocations[k],
      }));

    if (allocsToInsert.length > 0) {
      await supabase.from("leave_plan_allocations").insert(allocsToInsert);
    }

    setEditingPlanId(null);
    setSaving(false);
    router.refresh();
  };

  const deletePlan = async (planId: string) => {
    if (!confirm("Delete this leave plan? Employees on this plan will be unassigned.")) return;
    const supabase = createClient();
    await supabase.from("leave_plan_allocations").delete().eq("plan_id", planId);
    await supabase.from("users").update({ leave_plan_id: null }).eq("leave_plan_id", planId);
    await supabase.from("leave_plans").delete().eq("id", planId);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Create new plan */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} />
          Create Leave Plan
        </button>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">New Leave Plan</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Plan Name</label>
              <input
                type="text"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                placeholder="e.g., Year 1, Year 2-3, Year 5+"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description (optional)</label>
              <textarea
                rows={3}
                value={newPlanDesc}
                onChange={(e) => setNewPlanDesc(e.target.value)}
                placeholder="e.g., For employees in their first year"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grant On</label>
            <p className="text-xs text-gray-500 mb-2">When leave credits are granted each year</p>
            <select
              value={newGrantType}
              onChange={(e) => setNewGrantType(e.target.value as GrantType)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="custom">Custom Date</option>
              <option value="hire_date">Hire Date (including first year)</option>
              <option value="anniversary">Anniversary (1st year onwards)</option>
            </select>
            {newGrantType === "anniversary" && (
              <p className="mt-2 text-xs text-amber-600">
                Employees get 0 credits until their 1st work anniversary, then the full allocation each year after.
              </p>
            )}
            {newGrantType === "hire_date" && (
              <p className="mt-2 text-xs text-blue-600">
                Credits are prorated for new hires based on months remaining until the next cycle.
              </p>
            )}
          </div>

          {newGrantType === "custom" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Date</label>
              <p className="text-xs text-gray-500 mb-2">When balances reset each year</p>
              <div className="flex items-center gap-2">
                <select
                  value={newRenewalMonth}
                  onChange={(e) => setNewRenewalMonth(parseInt(e.target.value))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={newRenewalDay}
                  onChange={(e) => setNewRenewalDay(parseInt(e.target.value))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Days per leave type</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ALL_LEAVE_TYPE_KEYS.map((key) => (
                <div key={key} className="rounded-lg border border-gray-200 p-3">
                  <label className="block text-xs text-gray-500 mb-1">
                    {LEAVE_TYPES[key as keyof typeof LEAVE_TYPES].label}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newAllocations[key] ?? 0}
                    onChange={(e) =>
                      setNewAllocations({ ...newAllocations, [key]: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {message && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={saving || !newPlanName.trim()}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Creating..." : "Create Plan"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setMessage(""); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing plans */}
      {(plans.length === 0 && !showCreate) && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          No leave plans created yet. Create one to get started.
        </div>
      )}

      {plans.map((plan) => {
        const isEditing = editingPlanId === plan.id;
        const planAllocs = isEditing ? editAllocations : getAllocationsForPlan(plan.id);

        return (
          <div key={plan.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                {plan.description && (
                  <p className="text-sm text-gray-500">{plan.description}</p>
                )}
                <p className="text-xs text-gray-400">
                  {plan.grant_type === "anniversary"
                    ? "Granted on work anniversary (1st year onwards)"
                    : plan.grant_type === "hire_date"
                      ? "Granted on hire date each year"
                      : `Renews every ${MONTHS[(plan.renewal_month ?? 1) - 1]} ${plan.renewal_day ?? 1}`}
                </p>
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => saveEdit(plan.id)}
                      disabled={saving}
                      className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <Save size={14} />
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingPlanId(null)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(plan)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Edit allocations"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => deletePlan(plan.id)}
                      className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete plan"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {ALL_LEAVE_TYPE_KEYS.map((key) => {
                  const days = planAllocs[key] ?? 0;
                  return (
                    <div key={key} className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">
                        {LEAVE_TYPES[key as keyof typeof LEAVE_TYPES].label}
                      </p>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={editAllocations[key] ?? 0}
                          onChange={(e) =>
                            setEditAllocations({
                              ...editAllocations,
                              [key]: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      ) : (
                        <p className="mt-1 text-xl font-bold text-gray-900">
                          {days}
                          <span className="ml-1 text-xs font-normal text-gray-400">
                            day{days !== 1 ? "s" : ""}
                          </span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
