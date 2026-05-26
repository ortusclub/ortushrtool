import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { LeaveCreditsManager } from "@/components/admin/leave-credits-manager";
import type { LeaveCredit } from "@/types/database";

export default async function LeaveCreditsPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const [{ data: credits }, { data: users }] = await Promise.all([
    supabase
      .from("leave_credits")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email, department")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leave Credits</h1>
        <p className="text-gray-600">
          One-off per-employee leave credits. Each credit adds to the
          employee&apos;s allocated balance for the given leave type and stops
          counting once it expires.
        </p>
      </div>
      <LeaveCreditsManager
        initialCredits={(credits ?? []) as LeaveCredit[]}
        users={users ?? []}
      />
    </div>
  );
}
