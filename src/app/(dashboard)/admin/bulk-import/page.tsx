import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/helpers";
import { hasRole } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { BulkImportForm } from "@/components/admin/bulk-import-form";
import type {
  ProfileField,
  ProfileFieldSection,
} from "@/types/database";

export default async function BulkImportPage() {
  const user = await getCurrentUser();
  // hr_support can submit imports (they get queued for admin approval).
  if (user.role !== "hr_support" && !hasRole(user.role, "hr_admin")) {
    redirect("/");
  }
  const isQueued = user.role === "hr_support";
  const supabase = await createClient();

  // Include both built-in and custom fields — the importer handles both.
  const [{ data: sections }, { data: fields }] = await Promise.all([
    supabase
      .from("profile_field_sections")
      .select("*")
      .order("sort_order")
      .order("name"),
    supabase.from("profile_fields").select("*").order("sort_order"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">Bulk Import</h1>
        <p className="text-gray-600">
          Customise the CSV columns you want, download a template, fill it in,
          and upload. Matches employees by email and skips blanks (so partial
          updates are safe).
        </p>
        {isQueued && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Your imports are queued for admin approval before they go live.
          </p>
        )}
      </div>
      <BulkImportForm
        sections={(sections ?? []) as ProfileFieldSection[]}
        fields={(fields ?? []) as ProfileField[]}
      />
    </div>
  );
}
