import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, displayName } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import { ProfileTabs, type Tab } from "./tab-nav";

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  hr_support: "HR Support",
  hr_admin: "HR Admin",
  super_admin: "Super Admin",
};

const ROLE_COLORS: Record<string, string> = {
  employee: "bg-gray-100 text-gray-700",
  manager: "bg-blue-100 text-blue-700",
  hr_support: "bg-emerald-100 text-emerald-700",
  hr_admin: "bg-purple-100 text-purple-700",
  super_admin: "bg-red-100 text-red-700",
};

export default async function TeamMemberLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ userId: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { userId } = await params;
  const isOwnProfile = currentUser.id === userId;
  const isAdmin = hasRole(currentUser.role, "hr_admin");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, full_name, preferred_name, first_name, last_name, email, role, job_title, department, avatar_url, manager_id")
    .eq("id", userId)
    .single();

  if (!user) {
    return (
      <div className="space-y-4">
        <Link
          href="/team"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Team
        </Link>
        <p className="text-red-600">User not found.</p>
      </div>
    );
  }

  // Compute today's working location: an approved adjustment for today
  // wins; otherwise fall back to the active schedule for today's
  // day-of-week. Mon=0..Sun=6 to match the schedules table convention.
  const todayStr = new Date().toISOString().split("T")[0];
  const todayDow = (new Date().getDay() + 6) % 7;
  const [{ data: todaySchedule }, { data: todayAdjustment }] = await Promise.all([
    supabase
      .from("schedules")
      .select("work_location, is_rest_day")
      .eq("employee_id", userId)
      .eq("day_of_week", todayDow)
      .lte("effective_from", todayStr)
      .or(`effective_until.is.null,effective_until.gte.${todayStr}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("schedule_adjustments")
      .select("requested_work_location")
      .eq("employee_id", userId)
      .eq("requested_date", todayStr)
      .eq("status", "approved")
      .not("requested_work_location", "is", null)
      .maybeSingle(),
  ]);
  const workingLocationToday: string | null =
    todayAdjustment?.requested_work_location ??
    (todaySchedule && !todaySchedule.is_rest_day
      ? todaySchedule.work_location
      : null);
  const workingLocationLabel =
    workingLocationToday === "office"
      ? "Office today"
      : workingLocationToday === "online"
        ? "Online today"
        : null;

  const isDirectManager = user.manager_id === currentUser.id;
  // Skip-level: viewer is manager of user's manager
  let isSkipLevel = false;
  if (user.manager_id) {
    const { data: mgr } = await supabase
      .from("users")
      .select("manager_id")
      .eq("id", user.manager_id)
      .single();
    if (mgr?.manager_id === currentUser.id) isSkipLevel = true;
  }
  const canSeeRestricted = isAdmin || isOwnProfile || isDirectManager;
  const canSeePerformance =
    isAdmin || isOwnProfile || isDirectManager || isSkipLevel;

  const tabs: Tab[] = [
    { label: "Profile", href: `/team/${userId}` },
    { label: "Time Off", href: `/team/${userId}/time-off` },
  ];
  if (canSeeRestricted) {
    tabs.push({ label: "Attendance", href: `/team/${userId}/attendance` });
    tabs.push({ label: "Documents", href: `/team/${userId}/documents` });
  }
  if (canSeePerformance) {
    tabs.push({ label: "Performance", href: `/team/${userId}/performance` });
  }

  return (
    <div className="space-y-6">
      <Link
        href="/team"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Back to Team
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-4">
          {isOwnProfile ? (
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={user.avatar_url}
              userName={displayName(user)}
            />
          ) : (
            <UserAvatar
              name={displayName(user)}
              avatarUrl={user.avatar_url}
              size="lg"
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {displayName(user)}
            </h1>
            {user.job_title && (
              <p className="mt-0.5 text-sm text-gray-600">{user.job_title}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              {user.department && (
                <span className="flex items-center gap-1">
                  <Building2 size={14} />
                  {user.department}
                </span>
              )}
              {workingLocationLabel && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {workingLocationLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <ProfileTabs tabs={tabs} />

      {children}
    </div>
  );
}
