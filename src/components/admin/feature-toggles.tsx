"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

const FEATURES = [
  { route: "/schedule", label: "My Schedule" },
  { route: "/attendance", label: "My Attendance" },
  { route: "/requests", label: "Requests" },
  { route: "/holidays", label: "Holidays" },
  { route: "/weekly", label: "Weekly Overview" },
  { route: "/kpis", label: "KPIs" },
  { route: "/team", label: "Team Directory" },
  { route: "/attendance/team", label: "Team Attendance" },
  { route: "/flags", label: "Flags" },
  { route: "/attendance/all", label: "All Attendance" },
  { route: "/reports", label: "Reports" },
  { route: "/admin/schedules", label: "All Schedules" },
  { route: "/admin/holidays", label: "Manage Holidays" },
  { route: "/admin/leave-plans", label: "Leave Plans" },
  { route: "/admin/users", label: "Users" },
] as const;

export function FeatureToggles({
  comingSoonRoutes,
}: {
  comingSoonRoutes: string[];
}) {
  const router = useRouter();
  const [toggled, setToggled] = useState<Set<string>>(
    new Set(comingSoonRoutes)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const toggle = (route: string) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(route)) {
        next.delete(route);
      } else {
        next.add(route);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Delete all existing coming_soon: keys, then insert active ones
    await supabase
      .from("system_settings")
      .delete()
      .like("key", "coming_soon:%");

    const rows = Array.from(toggled).map((route) => ({
      key: `coming_soon:${route}`,
      value: "true",
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await supabase.from("system_settings").insert(rows);
    }

    setMessage("Feature visibility saved.");
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-xl border border-gray-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Feature Visibility
        </h2>
        <p className="text-sm text-gray-500">
          Toggle features that are still in progress. Non-super-admin users will
          see a &quot;Coming Soon&quot; page instead.
        </p>
      </div>

      {message && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {FEATURES.map(({ route, label }) => (
          <div
            key={route}
            className="flex items-center justify-between py-3"
          >
            <div>
              <p className="text-sm font-medium text-gray-700">{label}</p>
              <p className="text-xs text-gray-400">{route}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(route)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                toggled.has(route) ? "bg-yellow-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  toggled.has(route) ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
