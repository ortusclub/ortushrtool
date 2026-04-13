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

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <Home size={20} />, minRole: "employee" },
  { label: "My Schedule", href: "/schedule", icon: <Calendar size={20} />, minRole: "employee" },
  { label: "Requests", href: "/requests", icon: <ArrowRightLeft size={20} />, minRole: "employee" },
  { label: "My Attendance", href: "/attendance", icon: <Clock size={20} />, minRole: "employee" },
  { label: "Team Attendance", href: "/attendance/team", icon: <Clock size={20} />, minRole: "manager" },
  { label: "Holidays", href: "/holidays", icon: <CalendarHeart size={20} />, minRole: "employee" },
  { label: "Flags", href: "/flags", icon: <Flag size={20} />, minRole: "employee" },
  { label: "All Attendance", href: "/attendance/all", icon: <Clock size={20} />, minRole: "hr_admin" },
  { label: "Reports", href: "/reports", icon: <BarChart3 size={20} />, minRole: "hr_admin" },
  { label: "Weekly Overview", href: "/weekly", icon: <CalendarDays size={20} />, minRole: "employee" },
  { label: "All Schedules", href: "/admin/schedules", icon: <Calendar size={20} />, minRole: "hr_admin" },
  { label: "Manage Holidays", href: "/admin/holidays", icon: <CalendarHeart size={20} />, minRole: "hr_admin" },
  { label: "Users", href: "/admin/users", icon: <Users size={20} />, minRole: "hr_admin" },
  { label: "Settings", href: "/admin/settings", icon: <Settings size={20} />, minRole: "super_admin" },
];

export function Sidebar({ userRole }: { userRole: UserRole }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = navItems.filter((item) => hasRole(userRole, item.minRole));

  const navContent = (
    <nav className="flex flex-col gap-1 p-4">
      {filteredItems.map((item) => {
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
          </Link>
        );
      })}
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
