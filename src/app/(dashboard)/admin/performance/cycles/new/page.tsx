import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewCycleForm } from "@/components/admin/new-cycle-form";

export default async function NewCyclePage() {
  await requireRole("hr_admin");
  const supabase = await createClient();
  const [{ data: templates }, { data: users }] = await Promise.all([
    supabase
      .from("review_form_templates")
      .select("id, name")
      .order("name"),
    supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, last_name, email, department, is_active")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/performance"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Back to Performance
        </Link>
        <h1 className="font-display text-[26px] leading-tight text-gray-900">New Review Cycle</h1>
        <p className="text-gray-600">
          Create a cycle, pick a form template, set due dates and participants.
        </p>
      </div>
      <NewCycleForm
        templates={(templates ?? []) as { id: string; name: string }[]}
        users={(users ?? []) as {
          id: string;
          full_name: string;
          preferred_name: string | null;
          first_name: string | null;
          last_name: string | null;
          email: string;
          department: string | null;
        }[]}
      />
    </div>
  );
}
