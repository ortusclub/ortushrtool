"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  CalendarDays,
  CalendarHeart,
  Clock,
  Flag,
  BarChart3,
  Users,
  Settings,
  ArrowRightLeft,
  Home,
  Menu,
  X,
  Palmtree,
  Target,
  UsersRound,
  ChevronDown,
  SlidersHorizontal,
  Eye,
  Mail,
} from "lucide-react";
import { useState } from "react";
import type { UserRole } from "@/types/database";
import { cn, hasRole } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  minRole: UserRole;
}

interface NavSection {
  title: string;
  minRole: UserRole;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "",
    minRole: "employee",
    items: [
      { label: "Dashboard", href: "/", icon: <Home size={20} />, minRole: "employee" },
    ],
  },
  {
    title: "My Workspace",
    minRole: "employee",
    items: [
      { label: "My Schedule", href: "/schedule", icon: <Calendar size={20} />, minRole: "employee" },
      { label: "My Attendance", href: "/attendance", icon: <Clock size={20} />, minRole: "employee" },
      { label: "Schedule Requests", href: "/requests", icon: <ArrowRightLeft size={20} />, minRole: "employee" },
      { label: "Holidays", href: "/holidays", icon: <CalendarHeart size={20} />, minRole: "employee" },
      { label: "Team Calendar", href: "/weekly", icon: <CalendarDays size={20} />, minRole: "employee" },
      { label: "KPIs", href: "/kpis", icon: <Target size={20} />, minRole: "employee" },
      { label: "Team Directory", href: "/team", icon: <UsersRound size={20} />, minRole: "employee" },
    ],
  },
  {
    title: "Team",
    minRole: "manager",
    items: [
      { label: "Team Attendance", href: "/attendance/team", icon: <Clock size={20} />, minRole: "manager" },
      { label: "Flags", href: "/flags", icon: <Flag size={20} />, minRole: "manager" },
    ],
  },
  {
    title: "Admin",
    minRole: "hr_admin",
    items: [
      { label: "All Attendance", href: "/attendance/all", icon: <Clock size={20} />, minRole: "hr_admin" },
      { label: "Reports", href: "/reports", icon: <BarChart3 size={20} />, minRole: "hr_admin" },
      { label: "All Schedules", href: "/admin/schedules", icon: <Calendar size={20} />, minRole: "hr_admin" },
      { label: "Manage Holidays", href: "/admin/holidays", icon: <CalendarHeart size={20} />, minRole: "hr_admin" },
      { label: "Leave Plans", href: "/admin/leave-plans", icon: <Palmtree size={20} />, minRole: "hr_admin" },
      { label: "Users", href: "/admin/users", icon: <Users size={20} />, minRole: "hr_admin" },
    ],
  },
];

const settingsSubItems: NavItem[] = [
  { label: "General", href: "/admin/settings", icon: <SlidersHorizontal size={18} />, minRole: "super_admin" },
  { label: "Emails", href: "/admin/settings/emails", icon: <Mail size={18} />, minRole: "super_admin" },
  { label: "Feature Visibility", href: "/admin/settings/features", icon: <Eye size={18} />, minRole: "super_admin" },
];

export function Sidebar({
  userRole,
  comingSoonRoutes = [],
}: {
  userRole: UserRole;
  comingSoonRoutes?: string[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const settingsOpen = pathname.startsWith("/admin/settings");
  const [settingsExpanded, setSettingsExpanded] = useState(settingsOpen);

  const navContent = (
    <nav className="flex flex-col gap-1 p-4">
      {navSections.map((section) => {
        if (!hasRole(userRole, section.minRole)) return null;
        const visibleItems = section.items.filter((item) => hasRole(userRole, item.minRole));
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.title || "top"}>
            {section.title && (
              <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </p>
            )}
            {visibleItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  {item.icon}
                  {item.label}
                  {comingSoonRoutes.some((r) => item.href === r || item.href.startsWith(r + "/")) && userRole !== "super_admin" && (
                    <span className="ml-auto rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                      Soon
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}

      {/* Settings dropdown */}
      {hasRole(userRole, "super_admin") && (
        <div>
          <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Settings
          </p>
          <button
            onClick={() => setSettingsExpanded(!settingsExpanded)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              settingsOpen
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <Settings size={20} />
            Settings
            <ChevronDown
              size={16}
              className={cn(
                "ml-auto transition-transform",
                settingsExpanded && "rotate-180"
              )}
            />
          </button>
          {settingsExpanded && (
            <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-200 pl-3">
              {settingsSubItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 lg:static",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <h1 className="text-lg font-bold text-gray-900">Ortus Club</h1>
        </div>
        {navContent}
      </aside>
    </>
  );
}
