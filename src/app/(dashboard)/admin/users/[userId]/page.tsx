import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UserProfileForm } from "@/components/admin/user-profile-form";
import type { User } from "@/types/database";
import { displayName } from "@/lib/utils";

export default async function AdminUserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireRole("hr_admin");
  const { userId } = await params;
  const supabase = createAdminClient();

  const [{ data: user }, { data: managers }] = await Promise.all([
    supabase.from("users").select("*").eq("id", userId).single(),
    supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email, role")
      .in("role", ["manager", "hr_admin", "super_admin"])
      .eq("is_active", true)
      .order("full_name"),
  ]);

  if (!user) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Users
        </Link>
        <p className="text-red-600">User not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Users
        </Link>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">
          {displayName(user)}
        </h1>
        <p className="text-gray-600">{user.email}</p>
      </div>
      <UserProfileForm user={user as User} managers={(managers ?? []) as User[]} />
    </div>
  );
}
