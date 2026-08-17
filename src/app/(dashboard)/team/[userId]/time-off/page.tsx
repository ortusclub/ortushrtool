import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";
import { LEAVE_TYPE_LABELS, UNIVERSAL_LEAVE_TYPES } from "@/lib/constants";
import { getCycleEnd, getRenewalStart, prorateLeave } from "@/lib/leave-proration";
import { buildHolidaySet, countLeaveDays } from "@/lib/leave-days";
import { buildLeaveLedger } from "@/lib/leave-ledger";
import type { GrantType, LeaveRequest } from "@/types/database";
import { format, parseISO } from "date-fns";
import { Palmtree, Plane, CalendarDays } from "lucide-react";
import { TimeOffCalendar } from "./calendar";
import { LeaveRequestForm } from "@/components/profile/leave-request-form";
import { LeavePlansEditor } from "@/components/profile/leave-plans-editor";
import { LeaveBalanceCard } from "@/components/profile/leave-balance-card";

type LeaveLite = Pick<
  LeaveRequest,
  | "id"
  | "leave_type"
  | "leave_duration"
  | "half_day_period"
  | "start_date"
  | "end_date"
  | "status"
  | "reason"
  | "created_at"
  | "reviewed_at"
  | "reviewer_notes"
> & {
  reviewer: {
    full_name: string | null;
    preferred_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};


export default async function TeamMemberTimeOffTab({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { userId } = await params;
  const isOwnProfile = currentUser.id === userId;
  const isAdmin = hasRole(currentUser.role, "hr_admin");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, full_name, email, hire_date, manager_id, holiday_country")
    .eq("id", userId)
    .single();
  if (!user) return null;

  const isDirectManager = user.manager_id === currentUser.id;
  const canSeeBalances = isAdmin || isOwnProfile || isDirectManager;
  const canRequest = isAdmin || isOwnProfile || isDirectManager;

  const today = new Date().toISOString().slice(0, 10);

  // Plan assignments + plan details + allocations + leave history + credits
  const [
    { data: assignments },
    { data: leaves },
    { data: countryHolidays },
    { data: leaveCredits },
  ] = await Promise.all([
    supabase
      .from("employee_leave_plans")
      .select("plan_id, plan:leave_plans(id, name, description, grant_type, renewal_month, renewal_day)")
      .eq("employee_id", userId),
    supabase
      .from("leave_requests")
      .select(
        "id, leave_type, leave_duration, half_day_period, start_date, end_date, status, reason, created_at, reviewed_at, reviewer_notes, reviewer:users!leave_requests_reviewed_by_fkey(full_name, preferred_name, first_name, last_name, email)"
      )
      .eq("employee_id", userId)
      .order("start_date", { ascending: true }),
    // Holidays in the employee's country — used to exclude public holidays
    // from the "used" leave day count.
    supabase
      .from("holidays")
      .select("date, is_recurring")
      .eq("country", user.holiday_country),
    // Manual leave credits (admin-issued + earned CTO). Includes expired ones
    // so the type still shows after expiry; the ledger forfeits unused expired
    // days while keeping used ones netted correctly.
    supabase
      .from("leave_credits")
      .select("leave_type, days, granted_at, expires_at, notes, source")
      .eq("employee_id", userId)
      .lte("granted_at", today),
  ]);

  const todayYear = parseInt(today.slice(0, 4));
  const holidaySet = buildHolidaySet(
    countryHolidays ?? [],
    `${todayYear - 2}-01-01`,
    `${todayYear + 1}-12-31`
  );

  type PlanRow = {
    plan_id: string;
    plan: {
      id: string;
      name: string;
      description: string | null;
      grant_type: GrantType;
      renewal_month: number;
      renewal_day: number;
    } | null;
  };
  const planAssignments = ((assignments ?? []) as unknown as PlanRow[]).filter(
    (a) => a.plan !== null
  );
  const planIds = planAssignments.map((a) => a.plan_id);

  const { data: allocations } = planIds.length
    ? await supabase
        .from("leave_plan_allocations")
        .select("plan_id, leave_type, days_per_year")
        .in("plan_id", planIds)
    : { data: [] };

  // Supabase joins return reviewer as a single-element array; normalize to object|null.
  type RawLeaveRow = Omit<LeaveLite, "reviewer"> & {
    reviewer: Array<{
      full_name: string | null;
      preferred_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }> | null;
  };
  const allLeaves: LeaveLite[] = ((leaves ?? []) as unknown as RawLeaveRow[]).map(
    (l) => ({
      ...l,
      reviewer:
        Array.isArray(l.reviewer) && l.reviewer.length > 0 ? l.reviewer[0] : null,
    })
  );

  // ─── Balances per leave_type (fluid; no fixed max) ───
  // Each leave_type opens with its (prorated) plan allocation for the current
  // cycle, then credits and leaves net against it. Both credits and leaves are
  // scoped to the cycle start, so a refresh resets everything automatically.
  const planBuckets = new Map<string, { planBase: number; renewalStart: string }>();

  for (const pa of planAssignments) {
    const plan = pa.plan!;
    const planAllocs = (allocations ?? []).filter((a) => a.plan_id === plan.id);
    for (const a of planAllocs) {
      const { renewalStart, month, day } = getRenewalStart(
        plan.grant_type,
        plan.renewal_month,
        plan.renewal_day,
        user.hire_date,
        today
      );
      const prorated = prorateLeave(
        a.days_per_year,
        user.hire_date,
        renewalStart,
        month,
        day,
        plan.grant_type
      );
      const existing = planBuckets.get(a.leave_type);
      if (existing) {
        existing.planBase += prorated;
        if (renewalStart > existing.renewalStart) existing.renewalStart = renewalStart;
      } else {
        planBuckets.set(a.leave_type, { planBase: prorated, renewalStart });
      }
    }
  }

  // Every leave_type that has a plan, any credit (now incl. expired ones), or
  // any non-rejected leave request gets a balance row — so a used-up/expired
  // credited type (e.g. birthday leave already taken) still shows, and so does
  // a type the employee has actually taken with no plan allocation or credit
  // at all (e.g. a one-off Trinity leave). Rejected requests don't count.
  const allTypes = new Set<string>([
    ...planBuckets.keys(),
    ...(leaveCredits ?? []).map((c) => c.leave_type),
    ...allLeaves.filter((l) => l.status !== "rejected").map((l) => l.leave_type),
  ]);

  const balances = Array.from(allTypes).map((leaveType) => {
    const pb = planBuckets.get(leaveType);
    const cycleStart = pb?.renewalStart ?? `${todayYear}-01-01`;
    const ledger = buildLeaveLedger({
      leaveType,
      planBase: pb?.planBase ?? 0,
      cycleStart,
      cycleEnd: getCycleEnd(cycleStart),
      credits: (leaveCredits ?? []).filter((c) => c.leave_type === leaveType),
      leaves: allLeaves,
      holidays: holidaySet,
      today,
    });
    return {
      leaveType,
      label: LEAVE_TYPE_LABELS[leaveType] ?? leaveType,
      available: ledger.available,
      usedDays: ledger.usedDays,
      usedCount: ledger.usedCount,
      entries: ledger.entries,
      renewalStart: cycleStart,
    };
  });
  balances.sort((a, b) => a.label.localeCompare(b.label));

  // ─── Upcoming + recent leave requests ───
  const upcoming = allLeaves.filter((l) => l.end_date >= today).slice(0, 20);
  const past = allLeaves
    .filter((l) => l.end_date < today && l.status === "approved")
    .slice(-10)
    .reverse();

  // ─── Plan + leave-type options for the request form / plan editor ───
  const [{ data: allPlans }, { data: activated }] = await Promise.all([
    supabase.from("leave_plans").select("id, name, description"),
    supabase
      .from("employee_leave_types")
      .select("leave_type")
      .eq("employee_id", userId),
  ]);
  const activatedTypes = (activated ?? []).map((a) => a.leave_type);
  // Requestable types = universal + per-type activations + anything the
  // employee has via an assigned leave plan (planBuckets). The last part is
  // what surfaces plan-granted types like Bereavement, which are on the
  // profile's balances but were previously missing from this dropdown.
  const availableLeaveTypes = Array.from(
    new Set([
      ...UNIVERSAL_LEAVE_TYPES,
      ...activatedTypes,
      ...planBuckets.keys(),
    ])
  ).map((t) => ({ value: t, label: LEAVE_TYPE_LABELS[t] ?? t }));

  return (
    <div className="space-y-6">
      {/* Plans */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Palmtree size={14} />
          Leave Plans
        </h2>
        <LeavePlansEditor
          employeeId={userId}
          assigned={planAssignments.map((pa) => ({
            plan_id: pa.plan_id,
            name: pa.plan!.name,
            description: pa.plan!.description,
          }))}
          allPlans={(allPlans ?? []) as Array<{ id: string; name: string; description: string | null }>}
          canEdit={isAdmin}
        />
      </div>

      {/* Balances */}
      {canSeeBalances && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <Plane size={14} />
            Current Balances
          </h2>
          {balances.length === 0 ? (
            <p className="text-sm text-gray-500">No balances to show.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {balances.map((b) => (
                <LeaveBalanceCard
                  key={b.leaveType}
                  label={b.label}
                  available={b.available}
                  usedDays={b.usedDays}
                  usedCount={b.usedCount}
                  entries={b.entries}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendar + Upcoming side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <CalendarDays size={14} />
            Calendar
          </h2>
          <TimeOffCalendar
            leaves={allLeaves
              .filter((l) => l.status !== "cancelled")
              .map((l) => ({
              id: l.id,
              leave_type: l.leave_type,
              leave_duration: l.leave_duration,
              half_day_period: l.half_day_period,
              start_date: l.start_date,
              end_date: l.end_date,
              status: l.status as "approved" | "pending" | "rejected",
              reason: l.reason,
              created_at: l.created_at,
              reviewed_at: l.reviewed_at,
              reviewer_notes: l.reviewer_notes,
              reviewer: l.reviewer,
            }))}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Upcoming &amp; Pending
            </h2>
            {canRequest && (
              <LeaveRequestForm
                employeeId={userId}
                availableTypes={availableLeaveTypes}
              />
            )}
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on the horizon.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {upcoming.map((l) => (
                <LeaveRow key={l.id} leave={l} holidaySet={holidaySet} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Past approved */}
      {past.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Recent History
          </h2>
          <div className="divide-y divide-gray-100">
            {past.map((l) => (
              <LeaveRow key={l.id} leave={l} holidaySet={holidaySet} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveRow({ leave, holidaySet }: { leave: LeaveLite; holidaySet: Set<string> }) {
  const days =
    leave.leave_duration === "half_day"
      ? "0.5"
      : countLeaveDays(leave.start_date, leave.end_date, holidaySet).toString();
  const statusStyles: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    rejected: "bg-gray-200 text-gray-700",
  };
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type}
          </span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-600">{days} day{days === "1" ? "" : "s"}</span>
        </div>
        <p className="text-xs text-gray-500">
          {format(parseISO(leave.start_date), "MMM d, yyyy")}
          {leave.start_date !== leave.end_date &&
            ` – ${format(parseISO(leave.end_date), "MMM d, yyyy")}`}
        </p>
        {leave.reason && (
          <p className="mt-0.5 text-xs italic text-gray-500">{leave.reason}</p>
        )}
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
          statusStyles[leave.status] ?? "bg-gray-100"
        }`}
      >
        {leave.status}
      </span>
    </div>
  );
}
