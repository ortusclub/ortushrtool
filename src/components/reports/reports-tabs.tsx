"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ReportsDashboard } from "./reports-dashboard";
import { LeaveReport } from "./leave-report";
import { AdjustmentReport } from "./adjustment-report";

interface UserOption {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
}

const TABS = [
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "adjustments", label: "Schedule Changes" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function ReportsTabs({ users }: { users: UserOption[] }) {
  const [tab, setTab] = useState<Tab>("attendance");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "attendance" && <ReportsDashboard users={users} />}
      {tab === "leave" && <LeaveReport users={users} />}
      {tab === "adjustments" && <AdjustmentReport users={users} />}
    </div>
  );
}
