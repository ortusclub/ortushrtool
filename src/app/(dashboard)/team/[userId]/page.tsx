import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTime } from "@/lib/utils";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { HOLIDAY_COUNTRY_LABELS, type HolidayCountry } from "@/types/database";
import Link from "next/link";
import { ArrowLeft, Mail, Building2, Clock, Globe, Users, MapPin } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  hr_admin: "HR Admin",
  super_admin: "Super Admin",
};

const ROLE_COLORS: Record<string, string> = {
  employee: "bg-gray-100 text-gray-700",
  manager: "bg-blue-100 text-blue-700",
  hr_admin: "bg-purple-100 text-purple-700",
  super_admin: "bg-red-100 text-red-700",
};

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await getCurrentUser();
  const { userId } = await params;
  // Use admin client to bypass RLS — any employee can view any profile
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("*")
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

  // Fetch manager name
  let managerName: string | null = null;
  let managerId: string | null = null;
  if (user.manager_id) {
    const { data: manager } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("id", user.manager_id)
      .single();
    managerName = manager?.full_name || manager?.email || null;
    managerId = manager?.id ?? null;
  }

  // Fetch direct reports
  const { data: directReports } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("manager_id", userId)
    .eq("is_active", true)
    .order("full_name");

  // Fetch current schedule
  const today = new Date().toISOString().split("T")[0];
  const { data: schedules } = await supabase
    .from("schedules")
    .select("*")
    .eq("employee_id", userId)
    .lte("effective_from", today)
    .or(`effective_until.is.null,effective_until.gte.${today}`)
    .order("day_of_week", { ascending: true });

  const tz =
    user.timezone === "Asia/Manila"
      ? "PHT (Asia/Manila)"
      : user.timezone === "Europe/Berlin"
        ? "CET (Europe/Berlin)"
        : user.timezone === "Asia/Dubai"
          ? "GST (Asia/Dubai)"
          : user.timezone;

  const initials = user.full_name
    ? user.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.email[0].toUpperCase();

  return (
    <div className="space-y-6">
      <Link
        href="/team"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Back to Team
      </Link>

      {/* Profile Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {user.full_name || user.email}
            </h1>
            {user.job_title && (
              <p className="mt-0.5 text-sm text-gray-600">{user.job_title}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"}`}
              >
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              {user.department && (
                <span className="flex items-center gap-1">
                  <Building2 size={14} />
                  {user.department}
                </span>
              )}
              {user.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {user.location}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact & Details */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Details
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail size={16} className="shrink-0 text-gray-400" />
              <span className="text-gray-900">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock size={16} className="shrink-0 text-gray-400" />
              <span className="text-gray-900">{tz}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Globe size={16} className="shrink-0 text-gray-400" />
              <span className="text-gray-900">
                {HOLIDAY_COUNTRY_LABELS[user.holiday_country as HolidayCountry] ??
                  user.holiday_country}
              </span>
            </div>
            {managerName && (
              <div className="flex items-center gap-3 text-sm">
                <Users size={16} className="shrink-0 text-gray-400" />
                <span className="text-gray-600">Reports to </span>
                <Link
                  href={`/team/${managerId}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {managerName}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Direct Reports */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Direct Reports
          </h2>
          {directReports && directReports.length > 0 ? (
            <div className="space-y-2">
              {directReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/team/${report.id}`}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-gray-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {report.full_name
                      ? report.full_name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()
                      : report.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {report.full_name || report.email}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {report.email}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No direct reports</p>
          )}
        </div>
      </div>

      {/* Schedule */}
      {schedules && schedules.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Weekly Schedule
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {schedules.map((s) => (
              <div
                key={s.id}
                className={`rounded-lg border p-3 ${
                  s.is_rest_day
                    ? "border-gray-100 bg-gray-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <p className="text-sm font-medium text-gray-900">
                  {DAYS_OF_WEEK[s.day_of_week]}
                </p>
                {s.is_rest_day ? (
                  <p className="mt-1 text-xs text-gray-400">Rest Day</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatTime(s.start_time)} - {formatTime(s.end_time)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                      <MapPin size={12} />
                      {s.work_location === "office" ? "Office" : "Online"}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
