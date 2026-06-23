import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PerformanceTabs, type PerfTab } from "./tab-nav";

export default async function PerformanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Filter out tabs that have been toggled "Coming Soon" so they don't
  // appear in the tab bar for non-super-admin users.
  const supabase = await createClient();
  const { data: comingSoon } = await supabase
    .from("system_settings")
    .select("key")
    .like("key", "coming_soon:%")
    .eq("value", "true");
  const hidden = new Set(
    (comingSoon ?? []).map((s) => s.key.replace("coming_soon:", ""))
  );

  const allTabs: PerfTab[] = [
    { label: "Overview", href: "/performance" },
    { label: "Reviews", href: "/performance/reviews" },
    { label: "Peer Requests", href: "/performance/peer-requests" },
    { label: "Peer Feedback", href: "/performance/feedback" },
    { label: "KPIs", href: "/performance/kpis" },
    { label: "Kudos", href: "/performance/kudos" },
    { label: "1-on-1s", href: "/performance/one-on-ones" },
  ];
  const tabs = allTabs.filter((t) => !hidden.has(t.href));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Trophy size={22} /> Performance
        </h1>
        <p className="text-gray-600">
          Your reviews, feedback, KPIs, and recognition in one place.
        </p>
      </div>
      <PerformanceTabs tabs={tabs} />
      {children}
    </div>
  );
}
