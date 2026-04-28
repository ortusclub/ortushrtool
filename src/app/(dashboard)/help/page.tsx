import { getCurrentUser } from "@/lib/auth/helpers";
import { hasRole } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { HelpContent } from "@/components/help/help-content";

export default async function HelpPage() {
  const user = await getCurrentUser();
  const isManager = hasRole(user.role, "manager");
  const isAdmin = hasRole(user.role, "hr_admin");
  const isSuperAdmin = user.role === "super_admin";

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
          Learn how to use the Ortus Club HR Tool
        </p>
      </div>
      <HelpContent
        articles={articles ?? []}
        isManager={isManager}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
