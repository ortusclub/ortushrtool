import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Hourly cron that deactivates employees the day after their last day, in
 * their OWN local timezone.
 *
 * An account is deactivated once the current moment, expressed in the
 * employee's `timezone` (an IANA id like "Asia/Manila" or "Europe/Berlin"),
 * has rolled past midnight into the day AFTER their `end_date`. Because we
 * compare local calendar dates, this fires right at 00:00 local time the day
 * after departure — e.g. a PHT leaver flips at 00:00 PHT, a Kosovo/Italy
 * leaver at 00:00 CET/CEST. DST is handled automatically by the IANA zone.
 *
 * Running hourly catches each zone's local midnight within the hour (these
 * zones are all whole-hour offsets, so it lands on the top-of-hour run).
 *
 * Pass ?dry=1 to preview who WOULD be deactivated without changing anything.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const supabase = createAdminClient();

  const { data: users, error } = await supabase
    .from("users")
    .select("id, full_name, email, end_date, timezone")
    .eq("is_active", true)
    .not("end_date", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const due: Array<{
    id: string;
    name: string;
    end_date: string;
    timezone: string;
    local_today: string;
  }> = [];

  for (const u of users ?? []) {
    const tz = u.timezone || "Asia/Manila";
    let localToday: string;
    try {
      localToday = formatInTimeZone(now, tz, "yyyy-MM-dd");
    } catch {
      // Bad/unknown tz string — fall back to Manila so we never crash.
      localToday = formatInTimeZone(now, "Asia/Manila", "yyyy-MM-dd");
    }
    // Deactivate once we're into the day after their last working day.
    if (u.end_date && localToday > u.end_date) {
      due.push({
        id: u.id,
        name: u.full_name || u.email,
        end_date: u.end_date,
        timezone: tz,
        local_today: localToday,
      });
    }
  }

  if (!dryRun && due.length > 0) {
    const { error: updErr } = await supabase
      .from("users")
      .update({ is_active: false })
      .in(
        "id",
        due.map((d) => d.id)
      );
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    dry_run: dryRun,
    deactivated: due.length,
    users: due,
  });
}
