import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { BulkPlanAssign } from "@/components/admin/bulk-plan-assign";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function BulkAssignPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const [{ data: plans }, { data: users }] = await Promise.all([
    supabase.from("leave_plans").select("*").order("name"),
    supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email, department")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/leave-plans"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Leave Plans
        </Link>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">Bulk Assign Plans</h1>
        <p className="text-gray-600">
          Assign one or more leave plans to many employees at once.
        </p>
      </div>
      {(plans ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No leave plans exist yet. Create one on the{" "}
          <Link href="/admin/leave-plans" className="text-blue-600 hover:underline">
            Leave Plans page
          </Link>{" "}
          first.
        </div>
      ) : (
        <BulkPlanAssign plans={plans ?? []} users={users ?? []} />
      )}
    </div>
  );
}
