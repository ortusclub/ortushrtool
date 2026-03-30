"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { User } from "@/types/database";

export function Header({ user }: { user: User }) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const roleBadgeColor: Record<string, string> = {
    employee: "bg-gray-100 text-gray-700",
    manager: "bg-blue-100 text-blue-700",
    hr_admin: "bg-purple-100 text-purple-700",
    super_admin: "bg-red-100 text-red-700",
  };

  const roleLabel: Record<string, string> = {
    employee: "Employee",
    manager: "Manager",
    hr_admin: "HR Admin",
    super_admin: "Super Admin",
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${roleBadgeColor[user.role]}`}
        >
          {roleLabel[user.role]}
        </span>
        <span className="text-sm text-gray-700">{user.full_name || user.email}</span>
        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
