import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Returns a map of employee_id -> Subdepartment value.
 *
 * Subdepartment is a custom profile field (not a users column), stored in
 * profile_field_values keyed by the "Subdepartment" field's id. Read with the
 * admin client so it isn't trimmed by row-level security; callers are already
 * role-gated. Empty/blank values are skipped.
 */
export async function getSubdepartmentMap(): Promise<Map<string, string>> {
  const admin = createAdminClient();

  const { data: field } = await admin
    .from("profile_fields")
    .select("id")
    .eq("label", "Subdepartment")
    .maybeSingle();
  if (!field) return new Map();

  const { data: values } = await admin
    .from("profile_field_values")
    .select("employee_id, value")
    .eq("field_id", field.id);

  const map = new Map<string, string>();
  for (const v of values ?? []) {
    const trimmed = v.value?.trim();
    if (trimmed) map.set(v.employee_id, trimmed);
  }
  return map;
}
