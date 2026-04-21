import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ComingSoonGate } from "@/components/layout/coming-soon-gate";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("system_settings")
    .select("key")
    .like("key", "coming_soon:%")
    .eq("value", "true");

  const comingSoonRoutes = (settings ?? []).map((s) =>
    s.key.replace("coming_soon:", "")
  );

  return (
    <div className="flex h-full">
      <Sidebar userRole={user.role} comingSoonRoutes={comingSoonRoutes} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <ComingSoonGate userRole={user.role} comingSoonRoutes={comingSoonRoutes}>
            {children}
          </ComingSoonGate>
        </main>
      </div>
    </div>
  );
}
