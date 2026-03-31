import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllEmployees } from "@/lib/desktime/client";
import { format, subDays } from "date-fns";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Support ?date=YYYY-MM-DD for manual syncs, default to today
  const url = new URL(request.url);
  const syncDate =
    url.searchParams.get("date") ??
    format(new Date(), "yyyy-MM-dd");

  try {
    // Fetch tolerance settings once
    const { data: lateSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "late_tolerance_minutes")
      .single();
    const { data: earlySetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "early_tolerance_minutes")
      .single();
    const lateTolerance = parseInt(lateSetting?.value ?? "15");
    const earlyTolerance = parseInt(earlySetting?.value ?? "15");

    // Fetch all employees from DeskTime
    const dtEmployees = await fetchAllEmployees(syncDate);

    // Get user mapping from our DB
    const { data: users } = await supabase
      .from("users")
      .select("id, desktime_employee_id")
      .not("desktime_employee_id", "is", null)
      .eq("is_active", true);

    const userMap = new Map(
      (users ?? []).map((u) => [u.desktime_employee_id, u.id])
    );

    let synced = 0;
    let skipped = 0;

    for (const dtEmp of dtEmployees) {
      const userId = userMap.get(dtEmp.id);
      if (!userId) {
        skipped++;
        continue;
      }

      // Get the employee's schedule for this date
      const dateObj = new Date(syncDate + "T00:00:00");
      const dayOfWeek = (dateObj.getDay() + 6) % 7; // Monday=0

      // Check for approved adjustment first
      const { data: adjustment } = await supabase
        .from("schedule_adjustments")
        .select("requested_start_time, requested_end_time")
        .eq("employee_id", userId)
        .eq("requested_date", syncDate)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();

      // Fall back to default schedule
      const { data: schedule } = await supabase
        .from("schedules")
        .select("start_time, end_time, is_rest_day")
        .eq("employee_id", userId)
        .eq("day_of_week", dayOfWeek)
        .lte("effective_from", syncDate)
        .or(`effective_until.is.null,effective_until.gte.${syncDate}`)
        .limit(1)
        .maybeSingle();

      const scheduledStart =
        adjustment?.requested_start_time ?? schedule?.start_time ?? "09:00";
      const scheduledEnd =
        adjustment?.requested_end_time ?? schedule?.end_time ?? "18:00";
      const isRestDay = !adjustment && (schedule?.is_rest_day ?? false);

      // Parse DeskTime clock times
      // DeskTime returns "arrived" as "2026-03-27 08:05:42" or false
      const arrivedStr = dtEmp.arrived && typeof dtEmp.arrived === "string" ? dtEmp.arrived : null;
      const leftStr = dtEmp.left && typeof dtEmp.left === "string" ? dtEmp.left : null;
      const dtTimezone = (dtEmp as Record<string, unknown>).timezone as string | undefined;
      const clockIn = arrivedStr ? parseDesktimeTimestamp(arrivedStr, dtTimezone) : null;
      const clockOut = leftStr ? parseDesktimeTimestamp(leftStr, dtTimezone) : null;

      // Determine status
      let status: string = "on_time";
      let lateMinutes: number | null = null;
      let earlyMinutes: number | null = null;

      if (isRestDay) {
        status = "rest_day";
      } else if (!clockIn && !clockOut) {
        status = "absent";
      } else {
        // Calculate late arrival
        if (clockIn) {
          const scheduledStartMinutes = timeToMinutes(
            scheduledStart.slice(0, 5)
          );
          const actualStartMinutes = extractTimeMinutes(arrivedStr!);

          if (actualStartMinutes > scheduledStartMinutes + lateTolerance) {
            lateMinutes = actualStartMinutes - scheduledStartMinutes;
            status = "late_arrival";
          }
        }

        // Calculate early departure
        if (clockOut) {
          const scheduledEndMinutes = timeToMinutes(scheduledEnd.slice(0, 5));
          const actualEndMinutes = extractTimeMinutes(leftStr!);

          if (actualEndMinutes < scheduledEndMinutes - earlyTolerance) {
            earlyMinutes = scheduledEndMinutes - actualEndMinutes;
            status =
              status === "late_arrival" ? "late_and_early" : "early_departure";
          }
        }
      }

      // Upsert attendance log
      await supabase.from("attendance_logs").upsert(
        {
          employee_id: userId,
          date: syncDate,
          desktime_employee_id: dtEmp.id,
          clock_in: clockIn,
          clock_out: clockOut,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          status,
          late_minutes: lateMinutes,
          early_departure_minutes: earlyMinutes,
          raw_response: dtEmp as unknown as Record<string, unknown>,
        },
        { onConflict: "employee_id,date" }
      );

      synced++;
    }

    return NextResponse.json({
      success: true,
      date: syncDate,
      synced,
      skipped,
      total: dtEmployees.length,
    });
  } catch (error) {
    console.error("DeskTime sync error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}

// Parse "2026-03-27 08:05:42" to ISO timestamp
// DeskTime returns times in the employee's configured timezone (e.g. Asia/Singapore = UTC+8)
function parseDesktimeTimestamp(ts: string, dtTimezone?: string): string | null {
  if (!ts || ts === "false") return null;

  // Map common DeskTime timezones to UTC offsets
  const tzOffsets: Record<string, string> = {
    "Asia/Singapore": "+08:00",
    "Asia/Manila": "+08:00",
    "Asia/Hong_Kong": "+08:00",
    "Asia/Dubai": "+04:00",
    "Europe/Berlin": "+02:00", // CEST (summer)
    "Europe/London": "+01:00", // BST (summer)
    "UTC": "+00:00",
  };

  const offset = tzOffsets[dtTimezone ?? ""] ?? "+08:00"; // Default to +08:00 (PHT/SGT)
  const isoish = ts.replace(" ", "T") + offset;
  const date = new Date(isoish);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Extract HH:MM minutes from "2026-03-27 08:05:42" or "08:05"
function extractTimeMinutes(ts: string): number {
  // Try full datetime format first
  const dtMatch = ts.match(/(\d{2}):(\d{2}):\d{2}$/);
  if (dtMatch) {
    return parseInt(dtMatch[1]) * 60 + parseInt(dtMatch[2]);
  }
  // Fall back to HH:MM
  const parts = ts.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}
