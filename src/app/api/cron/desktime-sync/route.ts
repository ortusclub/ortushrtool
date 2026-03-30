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
  const syncDate = format(subDays(new Date(), 1), "yyyy-MM-dd");

  try {
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
      const dateObj = new Date(syncDate);
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
      const clockIn = dtEmp.arrived
        ? new Date(`${syncDate}T${dtEmp.arrived}:00+08:00`).toISOString()
        : null;
      const clockOut = dtEmp.left
        ? new Date(`${syncDate}T${dtEmp.left}:00+08:00`).toISOString()
        : null;

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
          const scheduledStartMinutes = timeToMinutes(scheduledStart);
          const actualStartMinutes = timeToMinutes(
            dtEmp.arrived ?? "00:00"
          );
          const { data: settings } = await supabase
            .from("system_settings")
            .select("value")
            .eq("key", "late_tolerance_minutes")
            .single();
          const tolerance = parseInt(settings?.value ?? "15");

          if (actualStartMinutes > scheduledStartMinutes + tolerance) {
            lateMinutes = actualStartMinutes - scheduledStartMinutes;
            status = "late_arrival";
          }
        }

        // Calculate early departure
        if (clockOut) {
          const scheduledEndMinutes = timeToMinutes(scheduledEnd);
          const actualEndMinutes = timeToMinutes(dtEmp.left ?? "23:59");
          const { data: settings } = await supabase
            .from("system_settings")
            .select("value")
            .eq("key", "early_tolerance_minutes")
            .single();
          const tolerance = parseInt(settings?.value ?? "15");

          if (actualEndMinutes < scheduledEndMinutes - tolerance) {
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

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}
