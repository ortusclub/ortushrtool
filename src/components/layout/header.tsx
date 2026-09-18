"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import type { User } from "@/types/database";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { displayName } from "@/lib/utils";
import { assignedCompanyLabel } from "@/lib/company-display";

export function Header({ user }: { user: User }) {
  const router = useRouter();
  const assignedTo = assignedCompanyLabel(user.company);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const roleBadgeColor: Record<string, string> = {
    employee: "bg-gray-100 text-gray-700",
    manager: "bg-blue-100 text-blue-700",
    hr_support: "bg-pink-100 text-pink-700",
    hr_admin: "bg-purple-100 text-purple-700",
    super_admin: "bg-red-100 text-red-700",
  };

  const roleLabel: Record<string, string> = {
    employee: "Employee",
    manager: "Manager",
    hr_support: "HR Support",
    hr_admin: "HR Admin",
    super_admin: "Super Admin",
  };

  return (
    /* Flame bar. The sidebar's brand block is also h-16 and sits immediately
       to the left, so the two form one continuous #E74820 band across the top
       — the p1 cover field carried across the whole header, not just a corner. */
    <header className="flex h-16 items-center justify-between bg-brand-topbar px-6">
      {/* Sits at the left end of the flame band, immediately right of the
          sidebar's logo block — so the brand and who you work with read as one
          line. Previously below the logo in the sidebar, where it was clipped. */}
      {assignedTo ? (
        <p className="truncate text-sm text-white" title={assignedTo}>
          Working with <span className="font-medium">{assignedTo}</span>
        </p>
      ) : (
        <div />
      )}
      <div className="flex shrink-0 items-center gap-4">
        <ThemeToggle className="rounded-lg p-2 text-white hover:bg-white/20" />
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${roleBadgeColor[user.role]}`}
        >
          {roleLabel[user.role]}
        </span>
        <Link
          href={`/team/${user.id}`}
          className="flex items-center gap-2 text-sm font-medium text-white hover:underline"
        >
          <UserAvatar name={displayName(user)} avatarUrl={user.avatar_url} size="xs" />
          {displayName(user)}
        </Link>
        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-white hover:bg-white/20"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
