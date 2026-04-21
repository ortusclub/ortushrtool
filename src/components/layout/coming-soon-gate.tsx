"use client";

import { usePathname } from "next/navigation";
import { ComingSoon } from "./coming-soon";
import type { UserRole } from "@/types/database";

export function ComingSoonGate({
  userRole,
  comingSoonRoutes,
  children,
}: {
  userRole: UserRole;
  comingSoonRoutes: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isComingSoon =
    userRole !== "super_admin" &&
    comingSoonRoutes.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );

  if (isComingSoon) return <ComingSoon />;
  return <>{children}</>;
}
