import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamDirectory } from "@/components/team/team-directory";
import { displayName } from "@/lib/utils";

export default async function TeamPage() {
  await getCurrentUser();
  // Use admin client to bypass RLS — team directory should show everyone
  const supabase = createAdminClient();

  const { data: users } = await supabase
    .from("users")
    .select(
      "id, full_name, preferred_name, first_name, last_name, email, role, department, job_title, location, manager_id"
    )
    .eq("is_active", true)
    .order("full_name");

  // Fetch manager names for display
  const managerIds = [
    ...new Set(
      (users ?? [])
        .map((u) => u.manager_id)
        .filter((id): id is string => id !== null)
    ),
  ];

  let managerMap: Record<string, string> = {};
  if (managerIds.length > 0) {
    const { data: managers } = await supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email")
      .in("id", managerIds);

    managerMap = Object.fromEntries(
      (managers ?? []).map((m) => [m.id, displayName(m)])
    );
  }

  const usersWithManager = (users ?? []).map((u) => ({
    ...u,
    manager_name: u.manager_id ? managerMap[u.manager_id] ?? null : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Directory</h1>
        <p className="text-gray-600">Browse and find people in the organization</p>
      </div>
      <TeamDirectory users={usersWithManager} />
    </div>
  );
}
