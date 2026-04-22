import { getCurrentUser } from "@/lib/auth/helpers";
import { hasRole } from "@/lib/utils";
import { HelpContent } from "@/components/help/help-content";

export default async function HelpPage() {
  const user = await getCurrentUser();
  const isManager = hasRole(user.role, "manager");
  const isAdmin = hasRole(user.role, "hr_admin");
  const isSuperAdmin = user.role === "super_admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; Guide</h1>
        <p className="text-gray-600">
          Learn how to use the Ortus Club HR Tool
        </p>
      </div>
      <HelpContent
        isManager={isManager}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
