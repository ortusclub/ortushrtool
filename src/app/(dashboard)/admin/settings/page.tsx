import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/admin/settings-form";
import { TEMPLATE_TOGGLE_KEYS } from "@/lib/email/template-meta";
import type { SystemSetting } from "@/types/database";

// Settings that should always appear on the form, even if no DB row exists.
// First save persists the chosen value.
const ENSURED_SETTINGS: Array<{ key: string; defaultValue: string }> = [
  { key: "pre_shift_window_hours", defaultValue: "5" },
];

// Settings we never want to show in this generic form (they have their own UI
// or aren't user-facing).
const HIDDEN_KEYS = new Set(["sidebar_order"]);

export default async function AdminSettingsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const { data: rawSettings } = await supabase
    .from("system_settings")
    .select("*")
    .not("key", "like", "coming_soon:%")
    .order("key");

  // Email-template toggles live on /admin/settings/emails alongside the templates.
  const toggleKeys = new Set(TEMPLATE_TOGGLE_KEYS);
  const existing = (rawSettings ?? []).filter(
    (s) => !toggleKeys.has(s.key) && !HIDDEN_KEYS.has(s.key)
  );
  const existingKeys = new Set(existing.map((s) => s.key));
  const ensured: SystemSetting[] = ENSURED_SETTINGS.filter(
    (e) => !existingKeys.has(e.key)
  ).map((e) => ({
    key: e.key,
    value: e.defaultValue,
    updated_by: null,
    updated_at: new Date().toISOString(),
  }));
  const settings = [...existing, ...ensured].sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">General Settings</h1>
        <p className="text-gray-600">
          Configure attendance tolerance and system behavior
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  );
}
