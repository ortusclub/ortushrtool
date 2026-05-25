import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, displayName } from "@/lib/utils";
import { OneOnOnesStandalone } from "@/components/performance/one-on-ones-standalone";
import { OneOnOnesFilters } from "@/components/performance/one-on-ones-filters";
import type { OneOnOne, User } from "@/types/database";

type SearchParams = Promise<{
  subject?: string;
  host?: string;
  dept?: string;
  country?: string;
  from?: string;
  to?: string;
}>;

export default async function OneOnOnesIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!hasRole(user.role, "manager")) {
    redirect("/performance/one-on-ones");
  }
  const params = await searchParams;
  const isAdmin = hasRole(user.role, "hr_admin");
  const admin = createAdminClient();

  // Base query
  let query = admin
    .from("one_on_ones")
    .select("*")
    .order("scheduled_date", { ascending: false });
  if (!isAdmin) {
    query = query.or(
      `manager_id.eq.${user.id},employee_id.eq.${user.id},participants.cs.["${user.id}"]`
    );
  }
  if (params.subject) query = query.eq("employee_id", params.subject);
  if (params.host) query = query.eq("manager_id", params.host);
  if (params.from) query = query.gte("scheduled_date", params.from);
  if (params.to) query = query.lte("scheduled_date", params.to);
  const { data: rawOneOnOnes } = await query;
  let oneOnOnes = (rawOneOnOnes ?? []) as OneOnOne[];

  // For filter dropdowns + name lookup we need users.
  const { data: usersData } = await admin
    .from("users")
    .select(
      "id, full_name, preferred_name, first_name, last_name, email, department, holiday_country, is_active"
    )
    .eq("is_active", true)
    .order("full_name");
  const allUsers = (usersData ?? []) as Array<
    Pick<
      User,
      | "id"
      | "full_name"
      | "preferred_name"
      | "first_name"
      | "last_name"
      | "email"
      | "department"
      | "holiday_country"
      | "is_active"
    >
  >;
  const userIndex: Record<string, (typeof allUsers)[number]> = {};
  for (const u of allUsers) userIndex[u.id] = u;

  // Department/location filter is applied after fetch because they live on
  // the user record, not the 1-on-1.
  if (params.dept) {
    oneOnOnes = oneOnOnes.filter(
      (o) => userIndex[o.employee_id]?.department === params.dept
    );
  }
  if (params.country) {
    oneOnOnes = oneOnOnes.filter(
      (o) => userIndex[o.employee_id]?.holiday_country === params.country
    );
  }

  // Distinct departments / countries (office) across visible users.
  const departments = Array.from(
    new Set(allUsers.map((u) => u.department).filter(Boolean))
  ) as string[];
  const countries = Array.from(
    new Set(allUsers.map((u) => u.holiday_country).filter(Boolean))
  ) as string[];

  // For the filter dropdowns, only show real participants in this dataset
  // so the lists are manageable. Admins see all users for both subject/host.
  const subjects = isAdmin
    ? allUsers.map((u) => ({ id: u.id, label: displayName(u) }))
    : Array.from(
        new Set(oneOnOnes.map((o) => o.employee_id))
      ).map((id) => ({
        id,
        label: userIndex[id] ? displayName(userIndex[id]) : id,
      }));
  const hosts = isAdmin
    ? allUsers.map((u) => ({ id: u.id, label: displayName(u) }))
    : Array.from(
        new Set(oneOnOnes.map((o) => o.manager_id).filter((x): x is string => !!x))
      ).map((id) => ({
        id,
        label: userIndex[id] ? displayName(userIndex[id]) : id,
      }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">1-on-1s</h1>
        <p className="text-gray-600">
          {isAdmin
            ? "All 1-on-1s across the org. Filter by subject, host, department, country, or date — then export to CSV."
            : "All your 1-on-1s in one place — schedule check-ins, take shared and private notes, loop in HR or peers."}
        </p>
      </div>
      <OneOnOnesFilters
        subjects={subjects}
        hosts={hosts}
        departments={departments}
        countries={countries}
        isAdmin={isAdmin}
      />
      <OneOnOnesStandalone
        viewerId={user.id}
        isAdmin={isAdmin}
        oneOnOnes={oneOnOnes}
        candidates={allUsers}
        userIndex={userIndex}
      />
    </div>
  );
}
