import type { UserRole } from "@/types/database";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  employee: 0,
  manager: 1,
  hr_admin: 2,
  super_admin: 3,
};

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DEFAULT_TOLERANCE_MINUTES = 15;

export const MANILA_TIMEZONE = "Asia/Manila";
