"use client";

import { useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Users, Upload, Check, Download } from "lucide-react";
import type { LeavePlan } from "@/types/database";
import { displayName } from "@/lib/utils";

interface UserInfo {
  id: string;
  full_name: string;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  department: string | null;
}

interface Props {
  plans: LeavePlan[];
  users: UserInfo[];
}

export function BulkPlanAssign({ plans, users }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Bulk assign state
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState("");

  // CSV state
  const [csvMessage, setCsvMessage] = useState("");
  const [csvUploading, setCsvUploading] = useState(false);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        displayName(u).toLowerCase().includes(q) ||
        (u.full_name?.toLowerCase().includes(q) ?? false) ||
        u.email.toLowerCase().includes(q) ||
        (u.department ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
  };

  const selectNone = () => {
    setSelectedUsers(new Set());
  };

  const handleBulkAssign = async () => {
    if (!selectedPlan || selectedUsers.size === 0) return;
    setAssigning(true);
    setMessage("");

    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    let assigned = 0;
    let skipped = 0;

    for (const userId of selectedUsers) {
      const { error } = await supabase
        .from("employee_leave_plans")
        .insert({
          employee_id: userId,
          plan_id: selectedPlan,
          assigned_by: authUser?.id ?? null,
        });

      if (error) {
        // Likely already assigned (unique constraint)
        skipped++;
      } else {
        assigned++;
      }
    }

    setMessage(`Assigned to ${assigned} employee(s)${skipped > 0 ? `, ${skipped} already had this plan` : ""}.`);
    setSelectedUsers(new Set());
    setAssigning(false);
    router.refresh();
  };

  const downloadSample = () => {
    const samplePlans = plans.length > 0
      ? [plans[0].name, plans[1]?.name ?? plans[0].name]
      : ["Year 5 - Base", "Solo Parent"];
    const csv = `email,plan\njohn@ortusclub.com,${samplePlans[0]}\njane@ortusclub.com,${samplePlans[1]}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leave-plan-assignments-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploading(true);
    setCsvMessage("");

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);

    if (lines.length < 2) {
      setCsvMessage("CSV must have a header row and at least one data row.");
      setCsvUploading(false);
      return;
    }

    // Parse header
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const emailIdx = header.findIndex((h) => h === "email");
    const planIdx = header.findIndex((h) => h === "plan" || h === "plan_name" || h === "leave_plan");

    if (emailIdx === -1 || planIdx === -1) {
      setCsvMessage("CSV must have 'email' and 'plan' (or 'plan_name') columns.");
      setCsvUploading(false);
      return;
    }

    // Build lookups
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    const planByName = new Map(plans.map((p) => [p.name.toLowerCase(), p.id]));

    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const email = cols[emailIdx]?.toLowerCase();
      const planName = cols[planIdx]?.toLowerCase();

      if (!email || !planName) continue;

      const userId = userByEmail.get(email);
      const planId = planByName.get(planName);

      if (!userId) {
        errors.push(`Row ${i + 1}: Unknown email "${cols[emailIdx]}"`);
        continue;
      }
      if (!planId) {
        errors.push(`Row ${i + 1}: Unknown plan "${cols[planIdx]}"`);
        continue;
      }

      const { error } = await supabase
        .from("employee_leave_plans")
        .insert({
          employee_id: userId,
          plan_id: planId,
          assigned_by: authUser?.id ?? null,
        });

      if (error) {
        skipped++;
      } else {
        assigned++;
      }
    }

    let msg = `Assigned ${assigned} plan(s)`;
    if (skipped > 0) msg += `, ${skipped} already assigned`;
    if (errors.length > 0) msg += `. Errors: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? ` and ${errors.length - 3} more` : ""}`;
    setCsvMessage(msg);
    setCsvUploading(false);

    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Bulk Assign */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Users size={20} />
            Bulk Assign Plan
          </h2>
          <p className="text-sm text-gray-500">Select a plan and check the employees to assign it to</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">Plan</label>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a plan...</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name, email, or department..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button onClick={selectAll} className="text-blue-600 hover:text-blue-700">Select all ({filteredUsers.length})</button>
            <span className="text-gray-300">|</span>
            <button onClick={selectNone} className="text-gray-500 hover:text-gray-700">Clear selection</button>
            {selectedUsers.size > 0 && (
              <span className="text-gray-500">{selectedUsers.size} selected</span>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
            {filteredUsers.map((u) => (
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-2 last:border-0 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedUsers.has(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{displayName(u)}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}{u.department ? ` — ${u.department}` : ""}</p>
                </div>
              </label>
            ))}
          </div>

          {message && (
            <div className={`rounded-lg p-3 text-sm ${message.includes("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {message}
            </div>
          )}

          <button
            onClick={handleBulkAssign}
            disabled={assigning || !selectedPlan || selectedUsers.size === 0}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Check size={16} />
            {assigning ? "Assigning..." : `Assign Plan to ${selectedUsers.size} Employee(s)`}
          </button>
        </div>
      </div>

      {/* CSV Upload */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Upload size={20} />
            Import from CSV
          </h2>
          <p className="text-sm text-gray-500">
            Upload a CSV with <code className="rounded bg-gray-100 px-1 text-xs">email</code> and <code className="rounded bg-gray-100 px-1 text-xs">plan</code> columns
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 text-xs text-gray-600 space-y-1">
            <p className="font-medium">CSV format example:</p>
            <pre className="mt-1 rounded bg-white p-2 text-[11px] text-gray-700 border">email,plan{"\n"}john@company.com,Year 5 - Base{"\n"}jane@company.com,Solo Parent</pre>
            <p className="mt-2">Plan names must match exactly as created above. One row per employee-plan assignment.</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              disabled={csvUploading}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              type="button"
              onClick={downloadSample}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Download size={14} />
              Sample
            </button>
            {csvUploading && <span className="text-sm text-blue-600">Processing...</span>}
          </div>

          {csvMessage && (
            <div className={`rounded-lg p-3 text-sm ${csvMessage.includes("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {csvMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
