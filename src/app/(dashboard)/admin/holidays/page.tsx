import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { HolidayManager } from "@/components/admin/holiday-manager";
import { HolidaySuggestionsReview } from "@/components/admin/holiday-suggestions-review";

export default async function AdminHolidaysPage() {
  await requireRole("hr_admin");
  const supabase = await createClient();

  const [{ data: holidays }, { data: suggestions }] = await Promise.all([
    supabase.from("holidays").select("*").order("date", { ascending: true }),
    supabase
      .from("holiday_suggestions")
      .select("id, country, name, date, year")
      .order("country", { ascending: true })
      .order("date", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Holidays</h1>
        <p className="text-gray-600">
          Add, edit, and remove public holidays for all office locations
        </p>
      </div>
      <HolidaySuggestionsReview suggestions={suggestions ?? []} />
      <HolidayManager holidays={holidays ?? []} />
    </div>
  );
}
