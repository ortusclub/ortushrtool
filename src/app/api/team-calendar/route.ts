import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Company-wide overlays for the Team Calendar: approved leaves, schedule
// adjustments, and holiday-work overlapping [start, end].
//
// The Team Calendar is viewable by every active employee, and its schedule +
// holiday layers already load company-wide (admin client, in weekly/page.tsx).
// These three overlays, though, used to be read client-side with the caller's
// own RLS-scoped client, so a non-admin only saw their own + their direct
// reports' entries — the leave/adjustment/holiday-work markers were missing
// for everyone else. Read them here with the admin client behind an auth
// check so the overlays match the rest of the calendar.
//
// Only the columns the calendar actually renders are returned — notably NOT
// reason / reviewer_notes — so widening visibility to all employees doesn't
// leak the free-text details of other people's requests.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end are required (yyyy-MM-dd)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const [{ data: leaves }, { data: adjustments }, { data: holidayWork }] =
    await Promise.all([
      admin
        .from("leave_requests")
        .select(
          "id, employee_id, leave_type, start_date, end_date, leave_duration, half_day_period"
        )
        .eq("status", "approved")
        .lte("start_date", end)
        .gte("end_date", start),
      admin
        .from("schedule_adjustments")
        .select(
          "id, employee_id, requested_date, requested_start_time, requested_end_time, requested_work_location, created_at"
        )
        .eq("status", "approved")
        .gte("requested_date", start)
        .lte("requested_date", end)
        // Oldest first, matching the previous client-side query so the
        // per-date adjustment selection is unchanged.
        .order("created_at", { ascending: true }),
      admin
        .from("holiday_work_requests")
        .select(
          "id, employee_id, holiday_date, start_time, end_time, work_location"
        )
        .eq("status", "approved")
        .gte("holiday_date", start)
        .lte("holiday_date", end),
    ]);

  return NextResponse.json({
    leaves: leaves ?? [],
    adjustments: adjustments ?? [],
    holidayWork: holidayWork ?? [],
  });
}
