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
