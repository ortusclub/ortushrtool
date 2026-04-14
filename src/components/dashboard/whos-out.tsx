"use client";
// Who's Out dashboard component

import { useState, useMemo } from "react";
import { Users, CalendarHeart } from "lucide-react";
import { HOLIDAY_COUNTRY_LABELS } from "@/types/database";

interface LeaveEntry {
  employeeId: string;
  name: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  managerId: string | null;
}

interface Holiday {
  name: string;
  date: string;
  country: string;
}

interface Props {
  leaves: LeaveEntry[];
  weekStartStr: string;
  upcomingHolidays: Holiday[];
  isReviewer: boolean;
  currentUserId: string;
  teamMemberIds: string[];
  directReportIds: string[];
}

type Filter = "everyone" | "my_team" | "direct_reports";

const leaveTypeLabels: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  personal: "Personal",
  unpaid: "Unpaid",
  other: "Other",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, "0");
  const nd = String(date.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function WhosOut({
  leaves,
  weekStartStr,
  upcomingHolidays,
  isReviewer,
  currentUserId,
  teamMemberIds,
  directReportIds,
}: Props) {
  const [filter, setFilter] = useState<Filter>("everyone");

  const teamSet = useMemo(() => new Set(teamMemberIds), [teamMemberIds]);
  const directSet = useMemo(() => new Set(directReportIds), [directReportIds]);

  const filteredLeaves = useMemo(() => {
    if (filter === "everyone") return leaves;
    if (filter === "my_team") return leaves.filter((l) => teamSet.has(l.employeeId));
    if (filter === "direct_reports") return leaves.filter((l) => directSet.has(l.employeeId));
    return leaves;
  }, [leaves, filter, teamSet, directSet]);

  const todayStr = toLocalDateStr(new Date());

  // Build weekday data
  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const dateStr = addDaysStr(weekStartStr, i);
      const [y, m, d] = dateStr.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      const entries = filteredLeaves.filter(
        (l) => dateStr >= l.startDate && dateStr <= l.endDate
      );

      return {
        dateStr,
        dayName: dayNames[date.getDay()],
        dayNum: d,
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
        entries,
      };
    });
  }, [weekStartStr, filteredLeaves, todayStr]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Users size={16} />
          Who&apos;s Out This Week
        </h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="everyone">Everyone</option>
          <option value="my_team">My Team</option>
          {isReviewer && <option value="direct_reports">My Direct Reports</option>}
        </select>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-5 divide-x divide-gray-100">
          {weekDays.map((day) => (
            <div
              key={day.dateStr}
              className={`p-4 ${day.isToday ? "bg-blue-50" : day.isPast ? "opacity-50" : ""}`}
            >
              <div className="mb-2 text-center">
                <p className={`text-xs font-semibold ${day.isToday ? "text-blue-700" : "text-gray-700"}`}>
                  {day.dayName}
                </p>
                <p className={`text-lg font-bold ${day.isToday ? "text-blue-900" : "text-gray-900"}`}>
                  {day.dayNum}
                </p>
              </div>
              {day.entries.length === 0 ? (
                <p className="text-center text-xs text-gray-300">&mdash;</p>
              ) : (
                <div className="space-y-1">
                  {day.entries.map((e, i) => (
                    <div
                      key={i}
                      className="rounded bg-amber-50 px-2 py-1 text-center"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {e.name}
                      </p>
                      <p className="text-[10px] text-amber-600">
                        {leaveTypeLabels[e.leaveType] ?? e.leaveType}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Holidays */}
      {upcomingHolidays.length > 0 && (
        <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-purple-900">
            <CalendarHeart size={16} />
            Upcoming Holidays
          </h3>
          <div className="space-y-1.5">
            {upcomingHolidays.map((h, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-purple-800">{h.name}</span>
                  <span className="ml-2 text-xs text-purple-500">{formatDate(h.date)}</span>
                </div>
                <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  {HOLIDAY_COUNTRY_LABELS[h.country as keyof typeof HOLIDAY_COUNTRY_LABELS] ?? h.country}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
