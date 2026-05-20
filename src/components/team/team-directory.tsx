"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  HOLIDAY_COUNTRY_LABELS,
  type HolidayCountry,
} from "@/types/database";
import { Search, LayoutGrid, List } from "lucide-react";
import { cn, displayName } from "@/lib/utils";
import { HeaderFilter } from "@/components/shared/header-filter";
import { SortButton, type SortDir } from "@/components/shared/sort-button";

interface TeamUser {
  id: string;
  full_name: string;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  department: string | null;
  job_title: string | null;
  location: string | null;
  holiday_country: HolidayCountry;
  is_active: boolean;
  end_date: string | null;
  manager_id: string | null;
  manager_name: string | null;
}

type EmploymentStatus = "active" | "inactive" | "terminated";

const STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
};

const STATUS_STYLES: Record<EmploymentStatus, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-200 text-gray-700",
  terminated: "bg-red-100 text-red-700",
};

function statusFor(user: TeamUser): EmploymentStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (user.end_date && user.end_date <= today) return "terminated";
  if (!user.is_active) return "inactive";
  return "active";
}

function getInitials(user: TeamUser): string {
  const name = displayName(user);
  return name && name !== "Unknown"
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.email[0].toUpperCase();
}

type ViewMode = "grid" | "list";

type SortColumn =
  | "name"
  | "email"
  | "job_title"
  | "department"
  | "country"
  | "manager"
  | "status";

export function TeamDirectory({ users }: { users: TeamUser[] }) {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<Set<string>>(new Set());
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set());
  const [jobTitleFilter, setJobTitleFilter] = useState<Set<string>>(new Set());
  const [managerFilter, setManagerFilter] = useState<Set<string>>(new Set());
  // Default to "active" only — matches the prior single-select behaviour.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set(["active"])
  );
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir } | null>(
    null
  );

  const toggleSort = (column: SortColumn) =>
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, dir: "asc" };
      if (prev.dir === "asc") return { column, dir: "desc" };
      return null;
    });

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) if (u.department) s.add(u.department);
    return Array.from(s).sort();
  }, [users]);

  const jobTitles = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) if (u.job_title) s.add(u.job_title);
    return Array.from(s).sort();
  }, [users]);

  const countries = useMemo(() => {
    const s = new Set<HolidayCountry>();
    for (const u of users) if (u.holiday_country) s.add(u.holiday_country);
    return Array.from(s).sort();
  }, [users]);

  // Unique managers: map manager_id -> display name (from manager_name on
  // each report). Anyone who appears as someone's manager shows up here,
  // plus a "(No manager)" entry for unmanaged reports.
  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    let hasUnmanaged = false;
    for (const u of users) {
      if (u.manager_id && u.manager_name) {
        map.set(u.manager_id, u.manager_name);
      } else if (!u.manager_id) {
        hasUnmanaged = true;
      }
    }
    const opts = [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (hasUnmanaged) opts.push({ value: "__none__", label: "(No manager)" });
    return opts;
  }, [users]);

  const filtered = useMemo(() => {
    let result = users.filter((u) => {
      if (statusFilter.size > 0 && !statusFilter.has(statusFor(u))) return false;
      if (departmentFilter.size > 0 && !departmentFilter.has(u.department ?? "")) return false;
      if (jobTitleFilter.size > 0 && !jobTitleFilter.has(u.job_title ?? "")) return false;
      if (countryFilter.size > 0 && !countryFilter.has(u.holiday_country)) return false;
      if (managerFilter.size > 0) {
        const key = u.manager_id ?? "__none__";
        if (!managerFilter.has(key)) return false;
      }
      return true;
    });
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          displayName(u).toLowerCase().includes(q) ||
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.department && u.department.toLowerCase().includes(q)) ||
          (u.job_title && u.job_title.toLowerCase().includes(q))
      );
    }
    if (sort) {
      const key = (u: TeamUser) => {
        switch (sort.column) {
          case "name":
            return displayName(u).toLowerCase();
          case "email":
            return u.email.toLowerCase();
          case "job_title":
            return (u.job_title ?? "").toLowerCase();
          case "department":
            return (u.department ?? "").toLowerCase();
          case "country":
            return (HOLIDAY_COUNTRY_LABELS[u.holiday_country] ?? "").toLowerCase();
          case "manager":
            return (u.manager_name ?? "").toLowerCase();
          case "status":
            return statusFor(u);
        }
      };
      result = [...result].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (ka < kb) return sort.dir === "asc" ? -1 : 1;
        if (ka > kb) return sort.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [
    users,
    statusFilter,
    departmentFilter,
    jobTitleFilter,
    countryFilter,
    managerFilter,
    search,
    sort,
  ]);

  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "terminated", label: "Terminated" },
  ];
  const countryOptions = countries.map((c) => ({
    value: c,
    label: HOLIDAY_COUNTRY_LABELS[c],
  }));
  const departmentOptions = departments.map((d) => ({ value: d, label: d }));
  const jobTitleOptions = jobTitles.map((t) => ({ value: t, label: t }));

  return (
    <div className="space-y-4">
      {/* View Toggle + Search & Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600">View</label>
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

        <div className="min-w-[200px] flex-1">
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
              placeholder="Search by name, email, dept, or title..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <FilterChip
            label="Status"
            count={statusFilter.size}
            filter={
              <HeaderFilter
                label="Status"
                options={statusOptions}
                selected={statusFilter}
                onChange={setStatusFilter}
                align="right"
              />
            }
          />
          {countries.length > 0 && (
            <FilterChip
              label="Country"
              count={countryFilter.size}
              filter={
                <HeaderFilter
                  label="Country"
                  options={countryOptions}
                  selected={countryFilter}
                  onChange={setCountryFilter}
                  align="right"
                />
              }
            />
          )}
          {departments.length > 0 && (
            <FilterChip
              label="Department"
              count={departmentFilter.size}
              filter={
                <HeaderFilter
                  label="Department"
                  options={departmentOptions}
                  selected={departmentFilter}
                  onChange={setDepartmentFilter}
                  align="right"
                />
              }
            />
          )}
          {jobTitles.length > 0 && (
            <FilterChip
              label="Position"
              count={jobTitleFilter.size}
              filter={
                <HeaderFilter
                  label="Position"
                  options={jobTitleOptions}
                  selected={jobTitleFilter}
                  onChange={setJobTitleFilter}
                  align="right"
                />
              }
            />
          )}
          {managerOptions.length > 0 && (
            <FilterChip
              label="Reports To"
              count={managerFilter.size}
              filter={
                <HeaderFilter
                  label="Reports To"
                  options={managerOptions}
                  selected={managerFilter}
                  onChange={setManagerFilter}
                  align="right"
                />
              }
            />
          )}
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? "person" : "people"}
          </p>
        </div>
      </div>

      {/* Content */}
      {view === "list" ? (
        <ListView
          users={filtered}
          sort={sort}
          toggleSort={toggleSort}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          statusOptions={statusOptions}
          countryFilter={countryFilter}
          setCountryFilter={setCountryFilter}
          countryOptions={countryOptions}
          departmentFilter={departmentFilter}
          setDepartmentFilter={setDepartmentFilter}
          departmentOptions={departmentOptions}
          jobTitleFilter={jobTitleFilter}
          setJobTitleFilter={setJobTitleFilter}
          jobTitleOptions={jobTitleOptions}
          managerFilter={managerFilter}
          setManagerFilter={setManagerFilter}
          managerOptions={managerOptions}
        />
      ) : (
        <GridView users={filtered} />
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  filter,
}: {
  label: string;
  count: number;
  filter: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className={cn("text-gray-600", count > 0 && "font-medium text-blue-700")}>
        {label}
        {count > 0 && ` (${count})`}
      </span>
      {filter}
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
      {users.map((user) => {
        const status = statusFor(user);
        return (
          <div
            key={user.id}
            className="relative rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
          >
            <Link
              href={`/team/${user.id}`}
              className="absolute inset-0 rounded-xl"
              aria-label={`View ${displayName(user)}`}
            />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {getInitials(user)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-gray-900">
                    {displayName(user)}
                  </p>
                  {status !== "active" && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status]}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">{user.email}</p>
                {user.job_title && (
                  <p className="mt-1 truncate text-xs text-gray-600">
                    {user.job_title}
                  </p>
                )}
                {(user.department ||
                  user.location ||
                  user.holiday_country) && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {[
                      user.department,
                      user.location,
                      HOLIDAY_COUNTRY_LABELS[user.holiday_country],
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {user.manager_name && user.manager_id && (
                  <p className="mt-2 text-xs text-gray-400">
                    Reports to{" "}
                    <Link
                      href={`/team/${user.manager_id}`}
                      className="relative text-blue-600 hover:underline"
                    >
                      {user.manager_name}
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── List View ─── */

interface ListViewProps {
  users: TeamUser[];
  sort: { column: SortColumn; dir: SortDir } | null;
  toggleSort: (col: SortColumn) => void;
  statusFilter: Set<string>;
  setStatusFilter: (s: Set<string>) => void;
  statusOptions: { value: string; label: string }[];
  countryFilter: Set<string>;
  setCountryFilter: (s: Set<string>) => void;
  countryOptions: { value: string; label: string }[];
  departmentFilter: Set<string>;
  setDepartmentFilter: (s: Set<string>) => void;
  departmentOptions: { value: string; label: string }[];
  jobTitleFilter: Set<string>;
  setJobTitleFilter: (s: Set<string>) => void;
  jobTitleOptions: { value: string; label: string }[];
  managerFilter: Set<string>;
  setManagerFilter: (s: Set<string>) => void;
  managerOptions: { value: string; label: string }[];
}

function ListView({
  users,
  sort,
  toggleSort,
  statusFilter,
  setStatusFilter,
  statusOptions,
  countryFilter,
  setCountryFilter,
  countryOptions,
  departmentFilter,
  setDepartmentFilter,
  departmentOptions,
  jobTitleFilter,
  setJobTitleFilter,
  jobTitleOptions,
  managerFilter,
  setManagerFilter,
  managerOptions,
}: ListViewProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        No people found matching your search.
      </div>
    );
  }

  const sortDir = (col: SortColumn) =>
    sort?.column === col ? sort.dir : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="px-6 py-3 font-medium text-gray-600">
                <span className="align-middle">Name</span>
                <SortButton label="Name" active={sortDir("name")} onClick={() => toggleSort("name")} />
              </th>
              <th className="px-6 py-3 font-medium text-gray-600">
                <span className="align-middle">Email</span>
                <SortButton label="Email" active={sortDir("email")} onClick={() => toggleSort("email")} />
              </th>
              <th className="px-6 py-3 font-medium text-gray-600">
                <span className="align-middle">Position</span>
                <SortButton label="Position" active={sortDir("job_title")} onClick={() => toggleSort("job_title")} />
                <HeaderFilter
                  label="Position"
                  options={jobTitleOptions}
                  selected={jobTitleFilter}
                  onChange={setJobTitleFilter}
                />
              </th>
              <th className="px-6 py-3 font-medium text-gray-600">
                <span className="align-middle">Department</span>
                <SortButton label="Department" active={sortDir("department")} onClick={() => toggleSort("department")} />
                <HeaderFilter
                  label="Department"
                  options={departmentOptions}
                  selected={departmentFilter}
                  onChange={setDepartmentFilter}
                />
              </th>
              <th className="px-6 py-3 font-medium text-gray-600">
                <span className="align-middle">Country</span>
                <SortButton label="Country" active={sortDir("country")} onClick={() => toggleSort("country")} />
                <HeaderFilter
                  label="Country"
                  options={countryOptions}
                  selected={countryFilter}
                  onChange={setCountryFilter}
                />
              </th>
              <th className="px-6 py-3 font-medium text-gray-600">
                <span className="align-middle">Reports To</span>
                <SortButton label="Reports To" active={sortDir("manager")} onClick={() => toggleSort("manager")} />
                <HeaderFilter
                  label="Reports To"
                  options={managerOptions}
                  selected={managerFilter}
                  onChange={setManagerFilter}
                />
              </th>
              <th className="px-6 py-3 font-medium text-gray-600">
                <span className="align-middle">Status</span>
                <SortButton label="Status" active={sortDir("status")} onClick={() => toggleSort("status")} />
                <HeaderFilter
                  label="Status"
                  options={statusOptions}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  align="right"
                />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => {
              const status = statusFor(user);
              return (
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
                        {displayName(user)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{user.email}</td>
                  <td className="px-6 py-3 text-gray-600">
                    {user.job_title || "—"}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {user.department || "—"}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {HOLIDAY_COUNTRY_LABELS[user.holiday_country] ?? "—"}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {user.manager_name && user.manager_id ? (
                      <Link
                        href={`/team/${user.manager_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {user.manager_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
