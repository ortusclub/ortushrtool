"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { LEAVE_TYPES, UNIVERSAL_LEAVE_TYPES } from "@/lib/constants";
import { prorateLeave } from "@/lib/leave-proration";

interface BalanceWarning {
  remaining: number;
  allocated: number;
  used: number;
  requestDays: number;
  newBalance: number;
}

export default function LeaveRequestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [balanceWarning, setBalanceWarning] = useState<BalanceWarning | null>(null);
  const [hasPlan, setHasPlan] = useState(false);

  const [planAllocations, setPlanAllocations] = useState<Record<string, number>>({});
  const [usedDays, setUsedDays] = useState<Record<string, number>>({});

  const [form, setForm] = useState({
    leave_type: "",
    leave_duration: "full_day" as "full_day" | "half_day",
    half_day_period: "am" as "am" | "pm",
    half_day_start_time: "",
    half_day_end_time: "",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const isHalfDay = form.leave_duration === "half_day";

  function countWeekdays(start: string, end: string): number {
    if (!start || !end || end < start) return 0;
    let count = 0;
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    const current = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    while (current <= endDate) {
      const dow = current.getDay();
      if (dow >= 1 && dow <= 5) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  function getRequestDays(): number {
    if (!form.start_date) return 0;
    if (isHalfDay) return 0.5;
    if (!form.end_date) return 0;
    return countWeekdays(form.start_date, form.end_date);
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: activated }, { data: assignedPlans }, { data: leavesThisYear }] = await Promise.all([
        supabase
          .from("employee_leave_types")
          .select("leave_type")
          .eq("employee_id", user.id),
        supabase
          .from("employee_leave_plans")
          .select("plan_id")
          .eq("employee_id", user.id),
        supabase
          .from("leave_requests")
          .select("leave_type, start_date, end_date, leave_duration")
          .eq("employee_id", user.id)
          .eq("status", "approved")
          .gte("start_date", `${new Date().getFullYear() - 1}-01-01`),
      ]);

      const activatedTypes = (activated ?? []).map((a) => a.leave_type);
      const available = [...UNIVERSAL_LEAVE_TYPES, ...activatedTypes];
      setAvailableTypes(available);
      setForm((f) => ({ ...f, leave_type: available[0] ?? "" }));

      const used: Record<string, number> = {};
      for (const l of leavesThisYear ?? []) {
        const days = l.leave_duration === "half_day" ? 0.5 : countWeekdays(l.start_date, l.end_date);
        used[l.leave_type] = (used[l.leave_type] ?? 0) + days;
      }
      setUsedDays(used);

      const planIds = (assignedPlans ?? []).map((p) => p.plan_id);
      if (planIds.length > 0) {
        setHasPlan(true);

        // Fetch allocations and plan renewal info together
        const [{ data: allocs }, { data: plans }, { data: profile }] = await Promise.all([
          supabase
            .from("leave_plan_allocations")
            .select("plan_id, leave_type, days_per_year")
            .in("plan_id", planIds),
          supabase
            .from("leave_plans")
            .select("id, renewal_month, renewal_day")
            .in("id", planIds),
          supabase
            .from("users")
            .select("hire_date")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

        const hireDate = profile?.hire_date ?? null;
        const now = new Date();
        const today = now.toISOString().split("T")[0];

        // Build renewal info per plan
        const planRenewalMap = new Map<string, { start: string; month: number; day: number }>();
        for (const p of plans ?? []) {
          const month = p.renewal_month ?? 1;
          const day = p.renewal_day ?? 1;
          const thisYear = `${now.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const lastYear = `${now.getFullYear() - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          planRenewalMap.set(p.id, {
            start: thisYear <= today ? thisYear : lastYear,
            month,
            day,
          });
        }

        const allocMap: Record<string, number> = {};
        for (const a of allocs ?? []) {
          const renewal = planRenewalMap.get(a.plan_id) ?? { start: `${now.getFullYear()}-01-01`, month: 1, day: 1 };
          const prorated = prorateLeave(a.days_per_year, hireDate, renewal.start, renewal.month, renewal.day);
          allocMap[a.leave_type] = (allocMap[a.leave_type] ?? 0) + prorated;
        }
        setPlanAllocations(allocMap);
      }

      setLoadingTypes(false);
    }
    load();
  }, []);

  const checkBalance = useCallback(() => {
    if (!hasPlan || !form.leave_type || !form.start_date) {
      setBalanceWarning(null);
      return;
    }

    const requestDays = getRequestDays();
    if (requestDays === 0) {
      setBalanceWarning(null);
      return;
    }

    const allocated = planAllocations[form.leave_type] ?? 0;
    const used = usedDays[form.leave_type] ?? 0;
    const remaining = allocated - used;
    const newBalance = remaining - requestDays;

    if (newBalance <= 0) {
      setBalanceWarning({ remaining, allocated, used, requestDays, newBalance });
    } else {
      setBalanceWarning(null);
    }
  }, [form.leave_type, form.start_date, form.end_date, form.leave_duration, hasPlan, planAllocations, usedDays]);

  useEffect(() => {
    checkBalance();
  }, [checkBalance]);

  // When switching to half day, sync end_date to start_date
  useEffect(() => {
    if (isHalfDay && form.start_date) {
      setForm((f) => ({ ...f, end_date: f.start_date }));
    }
  }, [isHalfDay, form.start_date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!isHalfDay && form.end_date < form.start_date) {
      setError("End date must be on or after start date.");
      setLoading(false);
      return;
    }

    if (isHalfDay && (!form.half_day_start_time || !form.half_day_end_time)) {
      setError("Please set the start and end time for your half day.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("leave_requests")
      .insert({
        employee_id: user.id,
        leave_type: form.leave_type,
        leave_duration: form.leave_duration,
        half_day_period: isHalfDay ? form.half_day_period : null,
        half_day_start_time: isHalfDay ? form.half_day_start_time : null,
        half_day_end_time: isHalfDay ? form.half_day_end_time : null,
        start_date: form.start_date,
        end_date: isHalfDay ? form.start_date : form.end_date,
        reason: form.reason,
      });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    try {
      await fetch("/api/notifications/leave-submitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: isHalfDay ? form.start_date : form.end_date,
          reason: form.reason,
          leave_duration: form.leave_duration,
          half_day_period: isHalfDay ? form.half_day_period : null,
        }),
      });
    } catch {
      // Non-blocking
    }

    router.push("/requests");
    router.refresh();
  };

  const leaveLabel = LEAVE_TYPES[form.leave_type as keyof typeof LEAVE_TYPES]?.label ?? form.leave_type;
  const requestDays = getRequestDays();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/requests"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Requests
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Request Leave</h1>
        <p className="text-gray-600">
          Submit a leave request for approval by your manager.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-gray-200 bg-white p-6"
      >
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Leave type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            What type of leave?
          </label>
          {loadingTypes ? (
            <div className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-400">
              Loading leave types...
            </div>
          ) : (
            <select
              value={form.leave_type}
              onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {availableTypes.map((key) => (
                <option key={key} value={key}>
                  {LEAVE_TYPES[key as keyof typeof LEAVE_TYPES]?.label ?? key}
                </option>
              ))}
            </select>
          )}
          {hasPlan && form.leave_type && !loadingTypes && (
            <p className="mt-1 text-xs text-gray-500">
              Balance: {(planAllocations[form.leave_type] ?? 0) - (usedDays[form.leave_type] ?? 0)} of {planAllocations[form.leave_type] ?? 0} day(s) remaining
            </p>
          )}
        </div>

        {/* Duration: full day or half day */}
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="mb-3 text-sm font-medium text-gray-700">
            How long will you be on leave?
          </p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="leave_duration"
                checked={form.leave_duration === "full_day"}
                onChange={() => setForm({ ...form, leave_duration: "full_day" })}
                className="h-4 w-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">Full day</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="leave_duration"
                checked={form.leave_duration === "half_day"}
                onChange={() => setForm({ ...form, leave_duration: "half_day" })}
                className="h-4 w-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">Half day</span>
            </label>
          </div>
        </div>

        {/* Half day options */}
        {isHalfDay && (
          <div className="space-y-4 rounded-lg border border-gray-200 p-4">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                Which half of the day?
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="half_day_period"
                    checked={form.half_day_period === "am"}
                    onChange={() => setForm({ ...form, half_day_period: "am" })}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">AM (morning)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="half_day_period"
                    checked={form.half_day_period === "pm"}
                    onChange={() => setForm({ ...form, half_day_period: "pm" })}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">PM (afternoon)</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Leave starts at
                </label>
                <input
                  type="time"
                  required
                  value={form.half_day_start_time}
                  onChange={(e) => setForm({ ...form, half_day_start_time: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Leave ends at
                </label>
                <input
                  type="time"
                  required
                  value={form.half_day_end_time}
                  onChange={(e) => setForm({ ...form, half_day_end_time: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Date selection */}
        {isHalfDay ? (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: e.target.value })}
              min={new Date().toISOString().split("T")[0]}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Start date
              </label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                min={new Date().toISOString().split("T")[0]}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                End date
              </label>
              <input
                type="date"
                required
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                min={form.start_date || new Date().toISOString().split("T")[0]}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Days count */}
        {requestDays > 0 && (
          <p className="text-sm text-gray-500">
            This request counts as <span className="font-semibold text-gray-700">{requestDays}</span> day{requestDays !== 1 ? "s" : ""} of leave.
          </p>
        )}

        {/* Balance warning */}
        {balanceWarning && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 text-red-500 shrink-0" />
              <div className="text-sm text-red-700">
                {balanceWarning.newBalance < 0 ? (
                  <>
                    <p className="font-medium">
                      This request ({balanceWarning.requestDays} day{balanceWarning.requestDays !== 1 ? "s" : ""}) will exceed your {leaveLabel} balance by {Math.abs(balanceWarning.newBalance)} day{Math.abs(balanceWarning.newBalance) !== 1 ? "s" : ""}.
                    </p>
                    <p className="mt-1">
                      The excess {Math.abs(balanceWarning.newBalance)} day{Math.abs(balanceWarning.newBalance) !== 1 ? "s" : ""} will be considered <span className="font-semibold">unpaid leave</span>.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">
                      This request ({balanceWarning.requestDays} day{balanceWarning.requestDays !== 1 ? "s" : ""}) will use your entire remaining {leaveLabel} balance.
                    </p>
                    <p className="mt-1">
                      You will have <span className="font-semibold">0 days</span> remaining after this request.
                    </p>
                  </>
                )}
                <p className="mt-1 text-xs text-red-500">
                  Current balance: {balanceWarning.remaining} / {balanceWarning.allocated} day{balanceWarning.allocated !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Reason for leave
          </label>
          <textarea
            required
            rows={4}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Please provide a reason for your leave request..."
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || loadingTypes}
            className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Leave Request"}
          </button>
          <Link
            href="/requests"
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
