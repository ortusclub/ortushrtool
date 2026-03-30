"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import type { SystemSetting } from "@/types/database";

const SETTING_LABELS: Record<string, string> = {
  late_tolerance_minutes: "Late Arrival Tolerance (minutes)",
  early_tolerance_minutes: "Early Departure Tolerance (minutes)",
};

export function SettingsForm({ settings }: { settings: SystemSetting[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value]))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const [key, value] of Object.entries(values)) {
      await supabase
        .from("system_settings")
        .upsert({
          key,
          value,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        });
    }

    setMessage("Settings saved successfully.");
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-xl border border-gray-200 bg-white p-6">
      {message && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700">
            {SETTING_LABELS[key] ?? key}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">Key: {key}</p>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
