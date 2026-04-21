import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/admin/settings-form";
import { FeatureToggles } from "@/components/admin/feature-toggles";

export default async function AdminSettingsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("system_settings")
    .select("*")
    .order("key");

  const allSettings = settings ?? [];

  const comingSoonRoutes = allSettings
    .filter((s) => s.key.startsWith("coming_soon:") && s.value === "true")
    .map((s) => s.key.replace("coming_soon:", ""));

  const systemSettings = allSettings.filter(
    (s) => !s.key.startsWith("coming_soon:")
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="text-gray-600">
          Configure attendance tolerance and system behavior
        </p>
      </div>
      <SettingsForm settings={systemSettings} />
      <FeatureToggles comingSoonRoutes={comingSoonRoutes} />
    </div>
  );
}
