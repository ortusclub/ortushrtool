"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { LEAVE_TYPES, UNIVERSAL_LEAVE_TYPES } from "@/lib/constants";
import { prorateLeave, getRenewalStart, getCycleEnd } from "@/lib/leave-proration";
import { buildHolidaySet, countLeaveDays, countLeaveDaysInCycle } from "@/lib/leave-days";
import { buildLeaveLedger } from "@/lib/leave-ledger";
import type { GrantType } from "@/types/database";

interface BalanceWarning {
  remaining: number;
  allocated: number;
  used: number;
  requestDays: number; // days charged to the CURRENT cycle
  spillDays: number; // days falling past the cycle end, charged to the next one
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
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  // Current cycle window per leave type — a request straddling the end of it
  // only draws this cycle's balance for the days before the boundary.
  const [cycleWindow, setCycleWindow] = useState<
    Record<string, { start: string; end: string }>
  >({});

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

  function getRequestDays(): number {
    if (!form.start_date) return 0;
    if (isHalfDay) return 0.5;
    if (!form.end_date) return 0;
    return countLeaveDays(form.start_date, form.end_date, holidaySet);
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: activated }, { data: assignedPlans }, { data: leavesThisYear }, { data: me }] = await Promise.all([
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
        supabase
          .from("users")
          .select("holiday_country")
          .eq("id", user.id)
          .single(),
      ]);

      // Holidays in the viewer's country — used to exclude public holidays
      // from the "used" day count and the "request days" preview.
      const { data: holRows } = me?.holiday_country
        ? await supabase
            .from("holidays")
            .select("date, is_recurring")
            .eq("country", me.holiday_country)
        : { data: [] };
      const currentYear = new Date().getFullYear();
      const localHolidays = buildHolidaySet(
        holRows ?? [],
        `${currentYear - 1}-01-01`,
        `${currentYear + 1}-12-31`
      );
      setHolidaySet(localHolidays);

      const activatedTypes = (activated ?? []).map((a) => a.leave_type);
      const available = [...UNIVERSAL_LEAVE_TYPES, ...activatedTypes];
      setAvailableTypes(available);
      setForm((f) => ({ ...f, leave_type: available[0] ?? "" }));

      // `used` is filled in below, once each leave type's cycle start is known,
      // so we only count leaves taken within the current cycle — matching the
      // ledger (leave-ledger.ts). Counting from a fixed prior-year floor here
      // double-charged leaves that started in the previous cycle.
      const used: Record<string, number> = {};

      const planIds = (assignedPlans ?? []).map((p) => p.plan_id);
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // Fetch plan-side and credit-side allocations in parallel. Either alone
      // is enough to give the employee a non-zero balance.
      const [{ data: profile }, { data: activeCredits }, planSide] = await Promise.all([
        supabase
          .from("users")
          .select("hire_date")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          // Expired credits are fetched too: buildLeaveLedger keeps them and
          // nets them against the leave they paid for. Excluding them (as this
          // once did) left the leave counted with nothing covering it, so a
          // credit granted, used, then expired showed as a negative balance.
          .from("leave_credits")
          .select("leave_type, days, granted_at, expires_at, notes, source")
          .eq("employee_id", user.id)
          .lte("granted_at", today),
        planIds.length > 0
          ? Promise.all([
              supabase
                .from("leave_plan_allocations")
                .select("plan_id, leave_type, days_per_year")
                .in("plan_id", planIds),
              supabase
                .from("leave_plans")
                .select("id, grant_type, renewal_month, renewal_day")
                .in("id", planIds),
            ])
          : Promise.resolve([{ data: [] }, { data: [] }] as const),
      ]);

      const hireDate = profile?.hire_date ?? null;
      const allocMap: Record<string, number> = {};
      const cycleStartByType: Record<string, string> = {};

      const [{ data: allocs }, { data: plans }] = planSide as [{ data: Array<{ plan_id: string; leave_type: string; days_per_year: number }> }, { data: Array<{ id: string; grant_type: GrantType; renewal_month: number; renewal_day: number }> }];
      for (const a of allocs ?? []) {
        const plan = (plans ?? []).find((p) => p.id === a.plan_id);
        const grantType = (plan?.grant_type ?? "custom") as GrantType;
        const { renewalStart, month, day } = getRenewalStart(
          grantType,
          plan?.renewal_month ?? 1,
          plan?.renewal_day ?? 1,
          hireDate,
          today
        );
        const prorated = prorateLeave(a.days_per_year, hireDate, renewalStart, month, day, grantType);
        allocMap[a.leave_type] = (allocMap[a.leave_type] ?? 0) + prorated;
        if (!cycleStartByType[a.leave_type] || renewalStart > cycleStartByType[a.leave_type]) {
          cycleStartByType[a.leave_type] = renewalStart;
        }
      }

      const yearStartStr = `${currentYear}-01-01`;
      // Credits only widen the set of types shown here; buildLeaveLedger
      // applies their days below, so adding them to allocMap would
      // double-count.
      for (const c of activeCredits ?? []) {
        if (!(c.leave_type in allocMap)) allocMap[c.leave_type] = 0;
      }

      const windows: Record<string, { start: string; end: string }> = {};
      for (const [type, start] of Object.entries(cycleStartByType)) {
        windows[type] = { start, end: getCycleEnd(start) };
      }
      setCycleWindow(windows);

      // One ledger, shared with the dashboard, the profile view and the
      // company report, so every surface agrees about the same person.
      for (const type of Object.keys(allocMap)) {
        const start = cycleStartByType[type] ?? yearStartStr;
        const ledger = buildLeaveLedger({
          leaveType: type,
          planBase: allocMap[type] ?? 0,
          cycleStart: start,
          cycleEnd: getCycleEnd(start),
          credits: (activeCredits ?? []).filter((c) => c.leave_type === type),
          leaves: leavesThisYear ?? [],
          holidays: localHolidays,
          today,
        });
        used[type] = ledger.usedDays;
        // planAllocations drives the "remaining = allocated − used" maths in
        // checkBalance, so feed it the ledger's own total.
        allocMap[type] = Math.round((ledger.available + ledger.usedDays) * 100) / 100;
      }
      setUsedDays(used);

      const hasAnyBalance =
        planIds.length > 0 || (activeCredits?.length ?? 0) > 0;
      if (hasAnyBalance) setHasPlan(true);
      setPlanAllocations(allocMap);

      // Widen the requestable types to include anything the employee actually
      // has via an assigned plan or active credit (allocMap keys) — not just
      // universal + per-type activations. Without this, plan-granted types like
      // Bereavement showed a balance but couldn't be selected here.
      const requestable = Array.from(
        new Set([
          ...UNIVERSAL_LEAVE_TYPES,
          ...activatedTypes,
          ...Object.keys(allocMap),
        ])
      );
      setAvailableTypes(requestable);
      setForm((f) => ({ ...f, leave_type: f.leave_type || requestable[0] || "" }));

      setLoadingTypes(false);
    }
    load();
  }, []);

  const checkBalance = useCallback(() => {
    if (!hasPlan || !form.leave_type || !form.start_date) {
      setBalanceWarning(null);
      return;
    }

    const totalDays = getRequestDays();
    if (totalDays === 0) {
      setBalanceWarning(null);
      return;
    }

    // Only the part of the request inside the current cycle draws down the
    // balance shown here; days past the cycle end come out of next cycle's
    // allocation, which isn't computed on this page.
    const win = cycleWindow[form.leave_type];
    const requestDays = win
      ? countLeaveDaysInCycle(
          {
            start_date: form.start_date,
            end_date: isHalfDay ? form.start_date : form.end_date,
            leave_duration: form.leave_duration,
          },
          holidaySet,
          win.start,
          win.end
        )
      : totalDays;
    const spillDays = Math.round((totalDays - requestDays) * 100) / 100;

    if (requestDays === 0) {
      setBalanceWarning(null);
      return;
    }

    const allocated = planAllocations[form.leave_type] ?? 0;
    const used = usedDays[form.leave_type] ?? 0;
    const remaining = allocated - used;
    const newBalance = remaining - requestDays;

    if (newBalance <= 0) {
      setBalanceWarning({ remaining, allocated, used, requestDays, spillDays, newBalance });
    } else {
      setBalanceWarning(null);
    }
  }, [form.leave_type, form.start_date, form.end_date, form.leave_duration, isHalfDay, hasPlan, planAllocations, usedDays, holidaySet, cycleWindow]);

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

  // How the request splits across the cycle boundary, so a range like
  // Dec 28 → Jan 4 tells the employee which part comes out of which cycle.
  const cycleWin = cycleWindow[form.leave_type];
  const daysThisCycle =
    cycleWin && form.start_date && (isHalfDay || form.end_date)
      ? countLeaveDaysInCycle(
          {
            start_date: form.start_date,
            end_date: isHalfDay ? form.start_date : form.end_date,
            leave_duration: form.leave_duration,
          },
          holidaySet,
          cycleWin.start,
          cycleWin.end
        )
      : requestDays;
  const spillDays = Math.round((requestDays - daysThisCycle) * 100) / 100;

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
              {Math.round(((planAllocations[form.leave_type] ?? 0) - (usedDays[form.leave_type] ?? 0)) * 100) / 100} day(s) available
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
                min={form.start_date || undefined}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Days count */}
        {requestDays > 0 && (
          <p className="text-sm text-gray-500">
            This request counts as <span className="font-semibold text-gray-700">{requestDays}</span> day{requestDays !== 1 ? "s" : ""} of leave.
            {spillDays > 0 && (
              <>
                {" "}
                Your leave cycle renews after{" "}
                <span className="font-semibold text-gray-700">{cycleWin?.end}</span>, so{" "}
                <span className="font-semibold text-gray-700">{daysThisCycle}</span> day
                {daysThisCycle !== 1 ? "s" : ""} come{daysThisCycle === 1 ? "s" : ""} out of
                your current balance and{" "}
                <span className="font-semibold text-gray-700">{spillDays}</span> day
                {spillDays !== 1 ? "s" : ""} out of next cycle&apos;s.
              </>
            )}
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
