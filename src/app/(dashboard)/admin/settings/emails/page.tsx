import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/utils";
import { EmailTemplateEditor } from "@/components/admin/email-template-editor";
import type { EmailTemplate } from "@/types/database";
import { TEMPLATE_TOGGLE_KEYS } from "@/lib/email/template-meta";
import {
  RECIPIENT_CONFIGURABLE_TYPES,
  resolveEffectiveRecipients,
} from "@/lib/email/recipients";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  hr_admin: "HR Admin",
  hr_support: "HR Support",
  hr_recruiter: "Recruiter",
  manager: "Manager",
  employee: "Employee",
};

export default async function EmailSettingsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: templates }, { data: settings }, { data: activeUsers }] =
    await Promise.all([
      supabase.from("email_templates").select("*").order("type"),
      supabase
        .from("system_settings")
        .select("key, value")
        .in("key", TEMPLATE_TOGGLE_KEYS),
      supabase
        .from("users")
        .select(
          "full_name, preferred_name, first_name, last_name, email, role"
        )
        .eq("is_active", true)
        .order("full_name"),
    ]);

  const toggles: Record<string, boolean> = {};
  for (const s of settings ?? []) {
    toggles[s.key] = s.value === "true";
  }

  // Directory for name/role lookup + the add-by-name box.
  const directory = (activeUsers ?? [])
    .filter((u) => u.email)
    .map((u) => ({
      email: u.email as string,
      name: displayName(u),
      role: ROLE_LABELS[u.role as string] ?? (u.role as string),
    }));

  // Resolve who each configurable email currently sends to (config or default),
  // so the editor pre-fills the editable recipient list with real addresses.
  const effective: Record<string, string[]> = {};
  await Promise.all(
    RECIPIENT_CONFIGURABLE_TYPES.map(async (t) => {
      effective[t] = await resolveEffectiveRecipients(admin, t);
    })
  );

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
        effectiveRecipients={effective}
        directory={directory}
      />
    </div>
  );
}
