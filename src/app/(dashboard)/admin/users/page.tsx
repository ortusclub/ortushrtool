import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserManagement } from "@/components/admin/user-management";
import { CsvImport } from "@/components/admin/csv-import";

export default async function AdminUsersPage() {
  const currentUser = await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("users")
    .select("*")
    .order("full_name");

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
        users={users ?? []}
        currentUserRole={currentUser.role}
      />
    </div>
  );
}
