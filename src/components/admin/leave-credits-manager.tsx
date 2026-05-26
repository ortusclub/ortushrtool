"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Search } from "lucide-react";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS } from "@/lib/constants";
import { displayName } from "@/lib/utils";
import type { LeaveCredit } from "@/types/database";

interface UserOption {
  id: string;
  full_name: string;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  department: string | null;
}

interface Props {
  initialCredits: LeaveCredit[];
  users: UserOption[];
}

const LEAVE_TYPE_KEYS = Object.keys(LEAVE_TYPES);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusOf(c: LeaveCredit, today: string): "scheduled" | "active" | "expired" {
  if (c.granted_at > today) return "scheduled";
  if (c.expires_at && c.expires_at < today) return "expired";
  return "active";
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  scheduled: "bg-blue-100 text-blue-700",
  expired: "bg-gray-100 text-gray-500",
};

export function LeaveCreditsManager({ initialCredits, users }: Props) {
  const router = useRouter();
  const today = todayStr();

  const [credits, setCredits] = useState<LeaveCredit[]>(initialCredits);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "scheduled" | "expired">("all");

  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "birthday",
    kind: "credit" as "credit" | "debit",
    days: "1",
    granted_at: today,
    expires_at: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const userById = useMemo(() => {
    const m = new Map<string, UserOption>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const filteredCredits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return credits.filter((c) => {
      if (statusFilter !== "all" && statusOf(c, today) !== statusFilter) return false;
      if (!q) return true;
      const u = userById.get(c.employee_id);
      if (!u) return false;
      return (
        displayName(u).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (LEAVE_TYPE_LABELS[c.leave_type] ?? c.leave_type).toLowerCase().includes(q)
      );
    });
  }, [credits, statusFilter, search, today, userById]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_id) {
      setError("Pick an employee.");
      return;
    }
    const magnitude = parseFloat(form.days);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setError("Days must be > 0.");
      return;
    }
    const days = form.kind === "debit" ? -magnitude : magnitude;
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data, error: insertErr } = await supabase
      .from("leave_credits")
      .insert({
        employee_id: form.employee_id,
        leave_type: form.leave_type,
        days,
        granted_at: form.granted_at || today,
        expires_at: form.expires_at || null,
        granted_by: authUser?.id ?? null,
        source: "manual",
        notes: form.notes.trim() || null,
      })
      .select("*")
      .single();
    setSaving(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setCredits((prev) => [data as LeaveCredit, ...prev]);
    setShowForm(false);
    setForm({
      employee_id: "",
      leave_type: "birthday",
      kind: "credit",
      days: "1",
      granted_at: today,
      expires_at: "",
      notes: "",
    });
    router.refresh();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this credit? The employee's allocated balance will drop by the credit amount.")) return;
    const supabase = createClient();
    const { error: delErr } = await supabase.from("leave_credits").delete().eq("id", id);
    if (delErr) {
      alert("Failed to revoke: " + delErr.message);
      return;
    }
    setCredits((prev) => prev.filter((c) => c.id !== id));
    router.refresh();
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-blue-200 bg-white p-6 shadow-sm"
        >
          <h3 className="text-lg font-semibold text-gray-900">
            {form.kind === "debit" ? "Add Debit" : "Add Credit"}
          </h3>
          <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setForm({ ...form, kind: "credit" })}
              className={`rounded-md px-3 py-1 font-medium ${form.kind === "credit" ? "bg-emerald-600 text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              Credit (+ days)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, kind: "debit" })}
              className={`rounded-md px-3 py-1 font-medium ${form.kind === "debit" ? "bg-red-600 text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              Debit (− days)
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Employee</label>
              <select
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className={inputClass + " mt-1"}
                required
              >
                <option value="">Select…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {displayName(u)} — {u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Leave Type</label>
              <select
                value={form.leave_type}
                onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
                className={inputClass + " mt-1"}
              >
                {LEAVE_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {LEAVE_TYPE_LABELS[k] ?? k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Days</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
                className={inputClass + " mt-1"}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Granted On</label>
                <input
                  type="date"
                  value={form.granted_at}
                  onChange={(e) => setForm({ ...form, granted_at: e.target.value })}
                  className={inputClass + " mt-1"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expires</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className={inputClass + " mt-1"}
                  placeholder="Never"
                />
                <p className="mt-1 text-xs text-gray-400">Blank = never expires</p>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass + " mt-1"}
                placeholder="e.g. Manual birthday grant, 2026 cycle"
              />
            </div>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Saving…" : form.kind === "debit" ? "Save Debit" : "Save Credit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError("");
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Credit
        </button>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600">Search</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Name, email, or leave type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            {filteredCredits.length} of {credits.length}
          </div>
        </div>

        {filteredCredits.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {credits.length === 0
              ? "No credits issued yet. Click Add Credit to grant one."
              : "No credits match the current filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3 font-medium">Employee</th>
                  <th className="py-2 pr-3 font-medium">Leave Type</th>
                  <th className="py-2 pr-3 font-medium">Days</th>
                  <th className="py-2 pr-3 font-medium">Granted</th>
                  <th className="py-2 pr-3 font-medium">Expires</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Notes</th>
                  <th className="py-2 pr-0 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCredits.map((c) => {
                  const u = userById.get(c.employee_id);
                  const status = statusOf(c, today);
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">
                          {u ? displayName(u) : "(unknown)"}
                        </div>
                        <div className="text-xs text-gray-500">{u?.email ?? c.employee_id}</div>
                      </td>
                      <td className="py-2 pr-3 text-gray-700">
                        {LEAVE_TYPE_LABELS[c.leave_type] ?? c.leave_type}
                      </td>
                      <td className={`py-2 pr-3 font-medium ${Number(c.days) < 0 ? "text-red-600" : "text-gray-900"}`}>
                        {Number(c.days) > 0 ? `+${c.days}` : c.days}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">{c.granted_at}</td>
                      <td className="py-2 pr-3 text-gray-600">{c.expires_at ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500">
                        {c.notes ?? ""}
                      </td>
                      <td className="py-2 pr-0">
                        <button
                          onClick={() => revoke(c.id)}
                          className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                          title="Revoke credit"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
