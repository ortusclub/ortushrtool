import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserManagement } from "@/components/admin/user-management";
import { CsvImport } from "@/components/admin/csv-import";

export default async function AdminUsersPage() {
  const currentUser = await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("users")
    .select("*")
    .order("full_name");

  // auth.users.last_sign_in_at is only readable via the service-role admin API.
  // Fetch it once and merge into the user list by id.
  const lastSignInById = new Map<string, string | null>();
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      lastSignInById.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch {
    // Service role key may be unset in some local envs; degrade gracefully.
  }

  const usersWithSignIn = (users ?? []).map((u) => ({
    ...u,
    last_sign_in_at: lastSignInById.get(u.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600">
          Manage employee profiles, roles, and DeskTime mappings
        </p>
      </div>
      <CsvImport />
      <UserManagement
        users={usersWithSignIn}
        currentUserRole={currentUser.role}
      />
    </div>
  );
}
