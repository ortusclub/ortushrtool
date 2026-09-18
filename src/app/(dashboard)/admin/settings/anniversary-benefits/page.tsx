import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { AnniversaryBenefitsManager } from "@/components/admin/anniversary-benefits-manager";

export default async function AnniversaryBenefitsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const { data: benefits } = await supabase
    .from("anniversary_benefits")
    .select("id, country, years, body, updated_at")
    .order("country")
    .order("years");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">Anniversary Benefits</h1>
        <p className="text-gray-600">
          Define what employees earn at each year milestone, per country. The
          work anniversary email shows the matching benefit when one exists for
          the employee&apos;s country and year count; otherwise the email sends
          without a benefits section.
        </p>
      </div>
      <AnniversaryBenefitsManager initialBenefits={benefits ?? []} />
    </div>
  );
}
