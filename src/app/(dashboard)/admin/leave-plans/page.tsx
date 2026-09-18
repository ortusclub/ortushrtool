import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { LeavePlansManager } from "@/components/admin/leave-plans-manager";
import Link from "next/link";
import { UsersRound } from "lucide-react";

export default async function LeavePlansPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const [{ data: plans }, { data: allocations }, { data: assignments }] =
    await Promise.all([
      supabase.from("leave_plans").select("*").order("name"),
      supabase.from("leave_plan_allocations").select("*"),
      supabase.from("employee_leave_plans").select("plan_id"),
    ]);
  const counts: Record<string, number> = {};
  for (const a of assignments ?? []) {
    counts[a.plan_id] = (counts[a.plan_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight text-gray-900">Leave Plans</h1>
          <p className="text-gray-600">
            Create and manage leave plans with allocations per leave type
          </p>
        </div>
        {(plans ?? []).length > 0 && (
          <Link
            href="/admin/leave-plans/bulk-assign"
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <UsersRound size={14} /> Bulk assign
          </Link>
        )}
      </div>
      <LeavePlansManager
        initialPlans={plans ?? []}
        initialAllocations={allocations ?? []}
        assignmentCounts={counts}
      />
    </div>
  );
}
