import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft, UsersRound } from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { displayName } from "@/lib/utils";

export default async function PlanAssigneesPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  await requireRole("hr_admin");
  const { planId } = await params;
  const supabase = await createClient();

  const [{ data: plan }, { data: assignments }] = await Promise.all([
    supabase
      .from("leave_plans")
      .select("id, name, description")
      .eq("id", planId)
      .single(),
    supabase
      .from("employee_leave_plans")
      .select(
        "user:users!employee_leave_plans_employee_id_fkey(id, full_name, preferred_name, first_name, last_name, email, department, avatar_url, is_active)"
      )
      .eq("plan_id", planId),
  ]);

  if (!plan) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/leave-plans"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Leave Plans
        </Link>
        <p className="text-red-600">Plan not found.</p>
      </div>
    );
  }

  type JoinedUser = {
    id: string;
    full_name: string;
    preferred_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
    department: string | null;
    avatar_url: string | null;
    is_active: boolean;
  };
  // Supabase has returned this embed as both a single object and as a
  // single-element array depending on version / inference; tolerate both.
  type RawAssignment = { user: JoinedUser | JoinedUser[] | null };
  const users = ((assignments ?? []) as unknown as RawAssignment[])
    .map((a) => (Array.isArray(a.user) ? (a.user[0] ?? null) : a.user))
    .filter((u): u is JoinedUser => u !== null)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));

  const active = users.filter((u) => u.is_active);
  const inactive = users.filter((u) => !u.is_active);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/leave-plans"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Leave Plans
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
        {plan.description && (
          <p className="text-gray-600">{plan.description}</p>
        )}
        <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
          <UsersRound size={14} />
          {users.length} assigned ({active.length} active
          {inactive.length > 0 ? `, ${inactive.length} inactive` : ""})
        </p>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No employees assigned to this plan yet.{" "}
          <Link
            href="/admin/leave-plans/bulk-assign"
            className="text-blue-600 hover:underline"
          >
            Bulk assign
          </Link>{" "}
          or open an employee&apos;s Time Off tab to assign them.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-100">
            {users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/team/${u.id}/time-off`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                >
                  <UserAvatar
                    name={displayName(u)}
                    avatarUrl={u.avatar_url}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {displayName(u)}
                      {!u.is_active && (
                        <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {u.email}
                      {u.department && ` · ${u.department}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
