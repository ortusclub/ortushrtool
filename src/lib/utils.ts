import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { MANILA_TIMEZONE } from "./constants";

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

export function toManilaTime(date: Date): Date {
  return toZonedTime(date, MANILA_TIMEZONE);
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Casual display name for a user — combines the preferred (or first) name with
 * the last name, e.g. "BB Batongbakal". Use anywhere a name is shown outside a
 * formal table or admin/audit context.
 *
 * Falls back to: preferred/first alone → full_name → email handle → "Unknown".
 */
export function displayName(
  user:
    | {
        preferred_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
      }
    | null
    | undefined
): string {
  if (!user) return "Unknown";
  const front = user.preferred_name || user.first_name;
  if (front && user.last_name) return `${front} ${user.last_name}`;
  return (
    front ||
    user.full_name ||
    user.email?.split("@")[0] ||
    "Unknown"
  );
}

export function hasRole(
  userRole: string,
  requiredRole: string
): boolean {
  const hierarchy: Record<string, number> = {
    employee: 0,
    manager: 1,
    hr_admin: 2,
    super_admin: 3,
  };
  return (hierarchy[userRole] ?? 0) >= (hierarchy[requiredRole] ?? 0);
}
