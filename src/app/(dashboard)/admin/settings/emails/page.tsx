import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { EmailTemplateEditor } from "@/components/admin/email-template-editor";
import type { EmailTemplate } from "@/types/database";
import { TEMPLATE_TOGGLE_KEYS } from "@/lib/email/template-meta";

export default async function EmailSettingsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const [{ data: templates }, { data: settings }] = await Promise.all([
    supabase.from("email_templates").select("*").order("type"),
    supabase
      .from("system_settings")
      .select("key, value")
      .in("key", TEMPLATE_TOGGLE_KEYS),
  ]);

  const toggles: Record<string, boolean> = {};
  for (const s of settings ?? []) {
    toggles[s.key] = s.value === "true";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
        <p className="text-gray-600">
          Customize the emails sent by the system
        </p>
      </div>
      <EmailTemplateEditor
        templates={(templates ?? []) as EmailTemplate[]}
        toggles={toggles}
      />
    </div>
  );
}
