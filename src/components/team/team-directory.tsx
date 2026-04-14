"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { UserRole } from "@/types/database";
import { Search, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department: string | null;
  job_title: string | null;
  location: string | null;
  manager_id: string | null;
  manager_name: string | null;
}

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

function getInitials(user: TeamUser): string {
  return user.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.email[0].toUpperCase();
}

type ViewMode = "grid" | "list";

export function TeamDirectory({ users }: { users: TeamUser[] }) {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [view, setView] = useState<ViewMode>("grid");

  const departments = useMemo(() => {
    const deps = new Set<string>();
    for (const u of users) {
      if (u.department) deps.add(u.department);
    }
    return Array.from(deps).sort();
  }, [users]);

  const filtered = useMemo(() => {
    let result = users;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.department && u.department.toLowerCase().includes(q))
      );
    }
    if (departmentFilter) {
      result = result.filter((u) => u.department === departmentFilter);
    }
    return result;
  }, [users, search, departmentFilter]);

  return (
    <div className="space-y-4">
      {/* View Toggle + Search & Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        {/* View toggle */}
        <div>
          <label className="block text-xs font-medium text-gray-600">
            View
          </label>
          <div className="mt-1 flex rounded-lg border border-gray-300">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "flex items-center gap-1 rounded-l-lg px-3 py-2 text-sm",
                view === "grid"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              )}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1 rounded-r-lg border-l border-gray-300 px-3 py-2 text-sm",
                view === "list"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              )}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {(
          <>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600">
                Search
              </label>
              <div className="relative mt-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, or department..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            {departments.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  Department
                </label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-sm text-gray-500">
              {filtered.length} {filtered.length === 1 ? "person" : "people"}
            </p>
          </>
        )}
      </div>

      {/* Content */}
      {view === "list" ? (
        <ListView users={filtered} />
      ) : (
        <GridView users={filtered} />
      )}
    </div>
  );
}

/* ─── Grid View ─── */

function GridView({ users }: { users: TeamUser[] }) {
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        No people found matching your search.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((user) => (
        <Link
          key={user.id}
          href={`/team/${user.id}`}
          className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
              {getInitials(user)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">
                {user.full_name || user.email}
              </p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
              {user.job_title && (
                <p className="mt-1 truncate text-xs text-gray-600">{user.job_title}</p>
              )}
              {(user.department || user.location) && (
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {[user.department, user.location].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                {user.manager_name && (
                  <span className="text-xs text-gray-400">
                    Reports to {user.manager_name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─── List View ─── */

function ListView({ users }: { users: TeamUser[] }) {
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        No people found matching your search.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="px-6 py-3 font-medium text-gray-600">Name</th>
              <th className="px-6 py-3 font-medium text-gray-600">Job Title</th>
              <th className="px-6 py-3 font-medium text-gray-600">
                Department
              </th>
              <th className="px-6 py-3 font-medium text-gray-600">Location</th>
              <th className="px-6 py-3 font-medium text-gray-600">Role</th>
              <th className="px-6 py-3 font-medium text-gray-600">
                Reports To
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <Link
                    href={`/team/${user.id}`}
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                      {getInitials(user)}
                    </div>
                    <span className="font-medium text-gray-900 hover:text-blue-600">
                      {user.full_name || user.email}
                    </span>
                  </Link>
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {user.job_title || "—"}
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {user.department || "—"}
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {user.location || "—"}
                </td>
                <td className="px-6 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {user.manager_name || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

