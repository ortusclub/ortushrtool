import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { HelpArticlesManager } from "@/components/admin/help-articles-manager";

export default async function AdminHelpPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const { data: articles } = await supabase
    .from("help_articles")
    .select(
      "id, section_title, section_position, section_role, question, answer, position"
    )
    .order("section_position", { ascending: true })
    .order("position", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; Guide</h1>
        <p className="text-gray-600">
          Edit the content of the public Help &amp; Guide page.
        </p>
      </div>
      <HelpArticlesManager articles={articles ?? []} />
    </div>
  );
}
