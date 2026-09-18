import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReviewTemplatesManager } from "@/components/admin/review-templates-manager";
import type { ReviewFormTemplate } from "@/types/database";

export default async function ReviewTemplatesPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("review_form_templates")
    .select("*")
    .order("created_at", { ascending: false });
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/performance"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Performance
        </Link>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">Review Form Templates</h1>
        <p className="text-gray-600">
          Build reusable question sets. Each question can be answered by any
          combination of self, manager, and peer.
        </p>
      </div>
      <ReviewTemplatesManager initialTemplates={(data ?? []) as ReviewFormTemplate[]} />
    </div>
  );
}
