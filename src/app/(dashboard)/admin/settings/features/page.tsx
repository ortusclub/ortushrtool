import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { FeatureToggles, type SidebarOrder } from "@/components/admin/feature-toggles";

export default async function FeatureVisibilityPage() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const [{ data: comingSoon }, { data: orderRow }] = await Promise.all([
    supabase
      .from("system_settings")
      .select("key, value")
      .like("key", "coming_soon:%")
      .eq("value", "true"),
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "sidebar_order")
      .maybeSingle(),
  ]);

  const comingSoonRoutes = (comingSoon ?? []).map((s) =>
    s.key.replace("coming_soon:", "")
  );
  let initialOrder: SidebarOrder = {};
  if (orderRow?.value) {
    try {
      initialOrder = JSON.parse(orderRow.value) as SidebarOrder;
    } catch {
      initialOrder = {};
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">
          Feature Visibility &amp; Order
        </h1>
        <p className="text-gray-600">
          Toggle features still in progress and reorder how they appear in the
          sidebar.
        </p>
      </div>
      <FeatureToggles
        comingSoonRoutes={comingSoonRoutes}
        initialOrder={initialOrder}
      />
    </div>
  );
}
