import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/utils";
import { LEAVE_TYPE_LABELS, UNIVERSAL_LEAVE_TYPES } from "@/lib/constants";
import { getRenewalStart, prorateLeave } from "@/lib/leave-proration";
import { buildHolidaySet, countLeaveDays } from "@/lib/leave-days";
import type { GrantType, LeaveRequest } from "@/types/database";
import { format, parseISO } from "date-fns";
import { Palmtree, Plane, CalendarDays } from "lucide-react";
import { TimeOffCalendar } from "./calendar";
import { LeaveRequestForm } from "@/components/profile/leave-request-form";
import { LeavePlansEditor } from "@/components/profile/leave-plans-editor";

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
    // Active manual leave credits (admin-issued).
    supabase
      .from("leave_credits")
      .select("leave_type, days, granted_at, expires_at")
      .eq("employee_id", userId)
      .lte("granted_at", today)
      .or(`expires_at.is.null,expires_at.gte.${today}`),
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

  // ─── Balances per leave_type ───
  type Bucket = {
    allocated: number;
    plans: Set<string>;
    renewalStart: string;
  };
  const buckets = new Map<string, Bucket>();

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
      const existing = buckets.get(a.leave_type);
      if (existing) {
        existing.allocated += prorated;
        existing.plans.add(plan.name);
        if (renewalStart > existing.renewalStart) {
          existing.renewalStart = renewalStart;
        }
      } else {
        buckets.set(a.leave_type, {
          allocated: prorated,
          plans: new Set([plan.name]),
          renewalStart,
        });
      }
    }
  }

  // Fold in manual leave credits. Each active credit adds to allocated for
  // its leave_type. Cycle scoping (renewalStart) stays with the plan; if a
  // leave_type has no plan, we fall back to today's start-of-year so the
  // credit covers leaves taken this calendar year.
  for (const c of leaveCredits ?? []) {
    const existing = buckets.get(c.leave_type);
    if (existing) {
      existing.allocated += Number(c.days);
      existing.plans.add("Manual credit");
    } else {
      buckets.set(c.leave_type, {
        allocated: Number(c.days),
        plans: new Set(["Manual credit"]),
        renewalStart: `${todayYear}-01-01`,
      });
    }
  }

  const balances = Array.from(buckets.entries()).map(([leaveType, b]) => {
    const used = allLeaves
      .filter(
        (l) =>
          l.leave_type === leaveType &&
          l.status === "approved" &&
          l.start_date >= b.renewalStart
      )
      .reduce(
        (sum, l) =>
          l.leave_duration === "half_day"
            ? sum + 0.5
            : sum + countLeaveDays(l.start_date, l.end_date, holidaySet),
        0
      );
    return {
      leaveType,
      label: LEAVE_TYPE_LABELS[leaveType] ?? leaveType,
      allocated: Math.round(b.allocated * 100) / 100,
      used,
      remaining: Math.round((b.allocated - used) * 100) / 100,
      renewalStart: b.renewalStart,
      plans: Array.from(b.plans),
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
  const availableLeaveTypes = Array.from(
    new Set([...UNIVERSAL_LEAVE_TYPES, ...activatedTypes])
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
                <div
                  key={b.leaveType}
                  className={`rounded-lg border p-3 ${b.remaining < 0 ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}
                >
                  <p className="text-sm font-medium text-gray-900">{b.label}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${b.remaining < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {b.remaining < 0 ? Math.abs(b.remaining) : b.remaining}
                    </span>
                    <span className={`text-xs ${b.remaining < 0 ? "font-medium text-red-500" : "text-gray-500"}`}>
                      {b.remaining < 0 ? "day unpaid" : `of ${b.allocated} day${b.allocated === 1 ? "" : "s"} left`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full ${b.remaining < 0 ? "bg-red-400" : "bg-emerald-500"}`}
                      style={{
                        width: b.remaining < 0 ? "100%" : `${b.allocated > 0 ? (b.remaining / b.allocated) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">
                    Used {b.used} · cycle starts{" "}
                    {format(parseISO(b.renewalStart), "MMM d, yyyy")}
                  </p>
                </div>
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
            leaves={allLeaves.map((l) => ({
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
