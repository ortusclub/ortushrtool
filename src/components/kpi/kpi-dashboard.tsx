"use client";

import { useState, useMemo } from "react";
import {
  KPI_UNIT_TYPES,
  KPI_PERIOD_TYPES,
  KPI_STATUS_LABELS,
} from "@/lib/constants";
import type {
  KpiAssignmentWithDetails,
  KpiDefinition,
  KpiAssignmentStatus,
  KpiPeriodType,
  User,
} from "@/types/database";
import { hasRole } from "@/lib/utils";
import { Plus, Pencil, History, Target } from "lucide-react";
import { KpiDefinitionForm } from "./kpi-definition-form";
import { KpiAssignForm } from "./kpi-assign-form";
import { KpiUpdateForm } from "./kpi-update-form";
import { KpiHistoryModal } from "./kpi-history-modal";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  manager_id: string | null;
}

interface Props {
  currentUser: User;
  myAssignments: KpiAssignmentWithDetails[];
  directReports: TeamMember[];
  directReportAssignments: KpiAssignmentWithDetails[];
  indirectReports: TeamMember[];
  indirectReportAssignments: KpiAssignmentWithDetails[];
  allEmployees: TeamMember[];
  allAssignments: KpiAssignmentWithDetails[];
  definitions: KpiDefinition[];
}

type TabKey = "my" | "direct" | "indirect" | "all";

export function KpiDashboard({
  currentUser,
  myAssignments,
  directReports,
  directReportAssignments,
  indirectReports,
  indirectReportAssignments,
  allEmployees,
  allAssignments,
  definitions,
}: Props) {
  const isManager = hasRole(currentUser.role, "manager");
  const isAdmin = hasRole(currentUser.role, "hr_admin");

  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [periodFilter, setPeriodFilter] = useState<KpiPeriodType | "">("");
  const [statusFilter, setStatusFilter] = useState<KpiAssignmentStatus | "">(
    ""
  );
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [showCreateDef, setShowCreateDef] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [editingAssignment, setEditingAssignment] =
    useState<KpiAssignmentWithDetails | null>(null);
  const [historyAssignment, setHistoryAssignment] =
    useState<KpiAssignmentWithDetails | null>(null);

  // Determine which data to show based on active tab
  const { assignments, teamMembers } = useMemo(() => {
    switch (activeTab) {
      case "my":
        return { assignments: myAssignments, teamMembers: [] as TeamMember[] };
      case "direct":
        return {
          assignments: directReportAssignments,
          teamMembers: directReports,
        };
      case "indirect":
        return {
          assignments: indirectReportAssignments,
          teamMembers: indirectReports,
        };
      case "all":
        return { assignments: allAssignments, teamMembers: allEmployees };
      default:
        return { assignments: [], teamMembers: [] as TeamMember[] };
    }
  }, [
    activeTab,
    myAssignments,
    directReportAssignments,
    directReports,
    indirectReportAssignments,
    indirectReports,
    allAssignments,
    allEmployees,
  ]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = assignments;
    if (periodFilter) {
      result = result.filter((a) => a.period_type === periodFilter);
    }
    if (statusFilter) {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (employeeFilter) {
      result = result.filter((a) => a.employee_id === employeeFilter);
    }
    return result;
  }, [assignments, periodFilter, statusFilter, employeeFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const total = filtered.length;
    let onTrack = 0;
    let atRisk = 0;
    let completed = 0;
    for (const a of filtered) {
      if (a.status === "completed") {
        completed++;
      } else if (a.target_value > 0) {
        const pct = (a.current_value / a.target_value) * 100;
        if (pct >= 80) onTrack++;
        else atRisk++;
      }
    }
    return { total, onTrack, atRisk, completed };
  }, [filtered]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "my", label: "My KPIs", count: myAssignments.length },
  ];
  if (isManager && directReports.length > 0) {
    tabs.push({
      key: "direct",
      label: "Direct Reports",
      count: directReportAssignments.length,
    });
  }
  if (isManager && indirectReports.length > 0) {
    tabs.push({
      key: "indirect",
      label: "Indirect Reports",
      count: indirectReportAssignments.length,
    });
  }
  if (isAdmin) {
    tabs.push({
      key: "all",
      label: "All Employees",
      count: allAssignments.length,
    });
  }

  // For the assign form, gather all team members the user can assign to
  const assignableMembers = useMemo(() => {
    if (isAdmin) return allEmployees;
    const map = new Map<string, TeamMember>();
    for (const m of [...directReports, ...indirectReports]) {
      map.set(m.id, m);
    }
    return Array.from(map.values());
  }, [isAdmin, allEmployees, directReports, indirectReports]);

  const showTeamColumn = activeTab !== "my";

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setEmployeeFilter("");
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-400">
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Period
          </label>
          <select
            value={periodFilter}
            onChange={(e) =>
              setPeriodFilter(e.target.value as KpiPeriodType | "")
            }
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Periods</option>
            {Object.entries(KPI_PERIOD_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as KpiAssignmentStatus | "")
            }
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            {Object.entries(KPI_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {showTeamColumn && teamMembers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Employee
            </label>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Employees</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {isManager && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowCreateDef(true)}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus size={16} />
              New KPI
            </button>
            <button
              onClick={() => setShowAssign(true)}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Target size={16} />
              Assign KPI
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="Total KPIs" value={stats.total} color="text-gray-900" />
        <SummaryCard label="On Track" value={stats.onTrack} color="text-green-600" />
        <SummaryCard label="At Risk" value={stats.atRisk} color="text-yellow-600" />
        <SummaryCard label="Completed" value={stats.completed} color="text-blue-600" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600">KPI</th>
                  {showTeamColumn && (
                    <th className="px-6 py-3 font-medium text-gray-600">
                      Employee
                    </th>
                  )}
                  <th className="px-6 py-3 font-medium text-gray-600">
                    Period
                  </th>
                  <th className="px-6 py-3 font-medium text-gray-600">
                    Progress
                  </th>
                  <th className="px-6 py-3 font-medium text-gray-600">
                    Status
                  </th>
                  <th className="px-6 py-3 font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((assignment) => {
                  const def = assignment.kpi_definition;
                  const unitSuffix =
                    def?.unit_label ||
                    (def ? KPI_UNIT_TYPES[def.unit_type].suffix : "");
                  const progress =
                    assignment.target_value > 0
                      ? Math.round(
                          (assignment.current_value /
                            assignment.target_value) *
                            100
                        )
                      : 0;

                  return (
                    <tr key={assignment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">
                          {def?.name || "—"}
                        </p>
                        {def?.description && (
                          <p className="text-xs text-gray-500">
                            {def.description}
                          </p>
                        )}
                      </td>
                      {showTeamColumn && (
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">
                            {assignment.employee?.full_name ||
                              assignment.employee?.email ||
                              "—"}
                          </p>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <p className="text-gray-900">
                          {KPI_PERIOD_TYPES[assignment.period_type]?.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {assignment.period_start} — {assignment.period_end}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-20 rounded-full bg-gray-200">
                            <div
                              className={`h-2 rounded-full ${
                                progress >= 80
                                  ? "bg-green-500"
                                  : progress >= 50
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              }`}
                              style={{
                                width: `${Math.min(progress, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="whitespace-nowrap text-xs font-medium text-gray-600">
                            {assignment.current_value}
                            {unitSuffix ? ` ${unitSuffix}` : ""} /{" "}
                            {assignment.target_value}
                            {unitSuffix ? ` ${unitSuffix}` : ""} ({progress}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            assignment.status === "active"
                              ? "bg-green-100 text-green-700"
                              : assignment.status === "completed"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {KPI_STATUS_LABELS[assignment.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {assignment.status === "active" && (
                            <button
                              onClick={() => setEditingAssignment(assignment)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="Update value"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => setHistoryAssignment(assignment)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="View history"
                          >
                            <History size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            {activeTab === "my"
              ? "No KPIs assigned to you yet."
              : "No KPIs found for the selected filters."}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateDef && (
        <KpiDefinitionForm onClose={() => setShowCreateDef(false)} />
      )}
      {showAssign && (
        <KpiAssignForm
          definitions={definitions}
          teamMembers={assignableMembers}
          onClose={() => setShowAssign(false)}
        />
      )}
      {editingAssignment && (
        <KpiUpdateForm
          assignment={editingAssignment}
          onClose={() => setEditingAssignment(null)}
        />
      )}
      {historyAssignment && (
        <KpiHistoryModal
          assignment={historyAssignment}
          onClose={() => setHistoryAssignment(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
