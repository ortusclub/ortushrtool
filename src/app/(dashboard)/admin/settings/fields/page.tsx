import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { ProfileFieldsManager } from "@/components/admin/profile-fields-manager";
import type {
  ProfileField,
  ProfileFieldSection,
} from "@/types/database";

export default async function FieldManagementPage() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const [{ data: sections }, { data: fields }, { data: values }] =
    await Promise.all([
      supabase
        .from("profile_field_sections")
        .select("*")
        .order("sort_order")
        .order("name"),
      supabase.from("profile_fields").select("*").order("sort_order"),
      supabase.from("profile_field_values").select("field_id, value"),
    ]);

  // Count of non-empty values per field, for the delete warning.
  const valueCounts: Record<string, number> = {};
  for (const v of values ?? []) {
    if (v.value && String(v.value).trim().length > 0) {
      valueCounts[v.field_id] = (valueCounts[v.field_id] ?? 0) + 1;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">Field Management</h1>
        <p className="text-gray-600">
          Define custom sections and fields shown on every Employee Profile.
          Each field has a visibility level controlling who sees its value.
        </p>
      </div>
      <ProfileFieldsManager
        initialSections={(sections ?? []) as ProfileFieldSection[]}
        initialFields={(fields ?? []) as ProfileField[]}
        initialValueCounts={valueCounts}
      />
    </div>
  );
}
