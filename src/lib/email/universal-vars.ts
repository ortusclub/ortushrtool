import { formatInTimeZone } from "date-fns-tz";

/**
 * Variables every template can use, populated from the email's "subject user"
 * (the person the email is about) and their manager. Each route that calls
 * `loadAndRender` should spread `getUniversalVars(...)` into its vars object.
 *
 * Listed in the admin editor's dropdown under "Universal".
 */
export const UNIVERSAL_VARIABLES = [
  "preferred_name",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "department",
  "job_title",
  "location",
  "manager_name",
  "manager_email",
  "app_url",
  "today_date",
] as const;

type SubjectUser = {
  preferred_name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  department?: string | null;
  job_title?: string | null;
  location?: string | null;
};

type Manager = {
  full_name?: string | null;
  email?: string | null;
};

export function getUniversalVars(
  user?: SubjectUser | null,
  manager?: Manager | null,
  appUrl?: string
): Record<string, string> {
  const today = formatInTimeZone(new Date(), "Asia/Manila", "MMMM d, yyyy");
  const fallbackPreferred =
    user?.preferred_name ||
    user?.first_name ||
    user?.full_name?.split(" ")[0] ||
    "";
  return {
    preferred_name: fallbackPreferred,
    full_name: user?.full_name || "",
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    email: user?.email || "",
    department: user?.department || "",
    job_title: user?.job_title || "",
    location: user?.location || "",
    manager_name: manager?.full_name || "",
    manager_email: manager?.email || "",
    app_url:
      appUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
    today_date: today,
  };
}
