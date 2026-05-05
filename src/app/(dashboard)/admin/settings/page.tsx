import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/admin/settings-form";
import { TEMPLATE_TOGGLE_KEYS } from "@/lib/email/template-meta";

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
  const settings = (rawSettings ?? []).filter((s) => !toggleKeys.has(s.key));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">General Settings</h1>
        <p className="text-gray-600">
          Configure attendance tolerance and system behavior
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  );
}
