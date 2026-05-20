import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamDirectory } from "@/components/team/team-directory";
import { displayName } from "@/lib/utils";

export default async function TeamPage() {
  await getCurrentUser();
  // Use admin client to bypass RLS — team directory should show everyone
  const supabase = createAdminClient();

  // Fetch everyone — the directory shows active, inactive, and terminated
  // employees, with a status filter on the client.
  const { data: users } = await supabase
    .from("users")
    .select(
      "id, full_name, preferred_name, first_name, last_name, email, role, department, job_title, location, holiday_country, is_active, end_date, manager_id"
    )
    .order("full_name");

  // Managers are already in the result set — look them up locally instead of
  // doing a second round-trip.
  const usersById = new Map(
    (users ?? []).map((u) => [u.id, u])
  );

  const usersWithManager = (users ?? []).map((u) => ({
    ...u,
    manager_name: u.manager_id
      ? (() => {
          const m = usersById.get(u.manager_id);
          return m ? displayName(m) : null;
        })()
      : null,
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
