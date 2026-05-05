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

    // Shift cutoff: activity before this hour is treated as previous day's overtime
    const { data: cutoffSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "shift_cutoff_hour")
      .maybeSingle();
    const shiftCutoffHour = parseInt(cutoffSetting?.value ?? "5");

    // Fetch all employees from DeskTime
    const dtEmployees = await fetchAllEmployees(syncDate);

    // Get user mapping from our DB (include holiday_country and timezone)
    const { data: users } = await supabase
      .from("users")
      .select("id, desktime_employee_id, holiday_country, timezone")
      .not("desktime_employee_id", "is", null)
      .eq("is_active", true);

    const userMap = new Map(
      (users ?? []).map((u) => [String(u.desktime_employee_id), u])
    );

    // Fetch holidays for the sync date
    const { data: holidaysOnDate } = await supabase
      .from("holidays")
      .select("country")
      .eq("date", syncDate);

    const holidayCountries = new Set(
      (holidaysOnDate ?? []).map((h) => h.country)
    );

    // Fetch approved leaves covering the sync date
    const { data: approvedLeaves } = await supabase
      .from("leave_requests")
      .select("employee_id")
      .eq("status", "approved")
      .lte("start_date", syncDate)
      .gte("end_date", syncDate);

    const employeesOnLeave = new Set(
      (approvedLeaves ?? []).map((l) => l.employee_id)
    );

    // Fetch approved holiday work requests for the sync date
    const { data: holidayWorkApprovals } = await supabase
      .from("holiday_work_requests")
      .select("employee_id")
      .eq("status", "approved")
      .eq("holiday_date", syncDate);

    const employeesWorkingHoliday = new Set(
      (holidayWorkApprovals ?? []).map((h) => h.employee_id)
    );

    // Check if sync date is today (for "workday not over" logic)
    const today = format(new Date(), "yyyy-MM-dd");
    const isSyncingToday = syncDate === today;

    // Re-evaluate any past attendance logs stuck as "working" or "not_started"
    const { data: staleWorking } = await supabase
      .from("attendance_logs")
      .select("id, clock_in, clock_out, scheduled_start, scheduled_end, raw_response")
      .in("status", ["working", "not_started"])
      .lt("date", today);

    for (const log of staleWorking ?? []) {
      const hasSchedule = !!(log.scheduled_start && log.scheduled_end);
      let newStatus = hasSchedule ? "on_time" : "no_schedule";
      let lateMin: number | null = null;
      let earlyMin: number | null = null;

      if (!log.clock_in && !log.clock_out) {
        newStatus = hasSchedule ? "absent" : "no_schedule";
      } else if (hasSchedule) {
        if (log.clock_in && log.raw_response) {
          const raw = log.raw_response as Record<string, unknown>;
          const arrivedRaw = raw.arrived as string | undefined;
          if (arrivedRaw) {
            const scheduledStartMin = timeToMinutes(log.scheduled_start!.slice(0, 5));
            const actualStartMin = extractTimeMinutes(arrivedRaw);
            if (actualStartMin > scheduledStartMin + lateTolerance) {
              lateMin = actualStartMin - scheduledStartMin;
              newStatus = "late_arrival";
            }
          }
        }

        if (log.clock_out && log.raw_response) {
          const raw = log.raw_response as Record<string, unknown>;
          const leftRaw = raw.left as string | undefined;
          if (leftRaw) {
            const scheduledEndMin = timeToMinutes(log.scheduled_end!.slice(0, 5));
            const actualEndMin = extractTimeMinutes(leftRaw);
            if (actualEndMin < scheduledEndMin - earlyTolerance) {
              earlyMin = scheduledEndMin - actualEndMin;
              newStatus = newStatus === "late_arrival" ? "late_and_early" : "early_departure";
            }
          }
        }
      }

      await supabase
        .from("attendance_logs")
        .update({
          status: newStatus,
          late_minutes: lateMin,
          early_departure_minutes: earlyMin,
        })
        .eq("id", log.id);
    }

    let synced = 0;
    let skipped = 0;

    for (const dtEmp of dtEmployees) {
      const userRecord = userMap.get(String(dtEmp.id));
      if (!userRecord) {
        skipped++;
        continue;
      }
      const userId = userRecord.id;
      const userTz = userRecord.timezone || "Asia/Manila";

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
        adjustment?.requested_start_time ?? schedule?.start_time ?? null;
      const scheduledEnd =
        adjustment?.requested_end_time ?? schedule?.end_time ?? null;
      const hasSchedule = scheduledStart !== null && scheduledEnd !== null;
      const isRestDay = !adjustment && (schedule?.is_rest_day ?? false);

      // Parse DeskTime clock times
      // DeskTime returns "arrived" as "2026-03-27 08:05:42" or false
      const SHIFT_CUTOFF_MINUTES = shiftCutoffHour * 60; // activity before this is previous day's overtime
      const arrivedStr = dtEmp.arrived && typeof dtEmp.arrived === "string" ? dtEmp.arrived : null;
      const leftStr = dtEmp.left && typeof dtEmp.left === "string" ? dtEmp.left : null;
      const dtTimezone = dtEmp.timezone;

      // Determine the "too early" cutoff for clock-in. With a schedule, anything
      // more than 2 hours before scheduled start is treated as previous day's
      // overtime; without one, fall back to the global shift_cutoff_hour.
      const scheduledStartMinutesForCutoff = hasSchedule
        ? timeToMinutes(scheduledStart!.slice(0, 5))
        : null;
      const earlyThresholdMinutes =
        scheduledStartMinutesForCutoff !== null
          ? Math.max(0, scheduledStartMinutesForCutoff - 120)
          : SHIFT_CUTOFF_MINUTES;

      // When pre-shift activity exists AND the day continues into / past the
      // 2h pre-shift band, we can't reliably infer the real clock-in (DeskTime
      // only exposes day-bookend timestamps, no per-session start times). Flag
      // the row so we can surface it as "Inconclusive" downstream.
      let multipleSessionsAmbiguous = false;
      let effectiveArrivedStr = arrivedStr;
      if (arrivedStr) {
        const arrivedMinutes = extractTimeMinutes(arrivedStr);
        if (arrivedMinutes < earlyThresholdMinutes) {
          const leftMinutes = leftStr ? extractTimeMinutes(leftStr) : null;
          const hasLaterActivity =
            leftMinutes !== null &&
            leftMinutes >= earlyThresholdMinutes &&
            scheduledStartMinutesForCutoff !== null;
          if (hasLaterActivity) {
            multipleSessionsAmbiguous = true;
          }
          effectiveArrivedStr = null;
        }
      }

      // Mirror the cutoff for "left" (preserves existing behaviour around
      // post-midnight overtime trailing into the next sync window).
      let effectiveLeftStr = leftStr;
      if (leftStr) {
        const leftMinutes = extractTimeMinutes(leftStr);
        if (leftMinutes < SHIFT_CUTOFF_MINUTES) {
          effectiveLeftStr = null;
        }
      }

      const clockIn = effectiveArrivedStr ? parseDesktimeTimestamp(effectiveArrivedStr, dtTimezone) : null;
      const clockOut = effectiveLeftStr ? parseDesktimeTimestamp(effectiveLeftStr, dtTimezone) : null;

      // Determine status
      let status: string = "on_time";
      let lateMinutes: number | null = null;
      let earlyMinutes: number | null = null;

      // Check leave first
      if (employeesOnLeave.has(userId)) {
        status = "on_leave";
      // Check holiday (unless they have an approved work-on-holiday)
      } else if (
        userRecord.holiday_country &&
        holidayCountries.has(userRecord.holiday_country) &&
        !employeesWorkingHoliday.has(userId)
      ) {
        status = "holiday";
      } else if (isRestDay) {
        status = "rest_day";
      } else if (!hasSchedule) {
        // No schedule on file for this date — don't infer late/absent/etc.
        status = "no_schedule";
      } else if (!clockIn && !clockOut) {
        // Only mark absent if we're past the scheduled start time
        if (isSyncingToday) {
          const nowInTz = getCurrentTimeMinutes(userTz);
          const scheduledStartMinutes = timeToMinutes(scheduledStart!.slice(0, 5));
          status = nowInTz >= scheduledStartMinutes ? "absent" : "not_started";
        } else {
          status = "absent";
        }
      } else {
        // Calculate late arrival
        if (clockIn && effectiveArrivedStr) {
          const scheduledStartMinutes = timeToMinutes(
            scheduledStart!.slice(0, 5)
          );
          const actualStartMinutes = extractTimeMinutes(effectiveArrivedStr);

          if (actualStartMinutes > scheduledStartMinutes + lateTolerance) {
            lateMinutes = actualStartMinutes - scheduledStartMinutes;
            status = "late_arrival";
          }
        }

        // Calculate early departure — only if the workday is over
        if (clockOut && effectiveLeftStr) {
          const scheduledEndMinutes = timeToMinutes(scheduledEnd!.slice(0, 5));

          if (isSyncingToday) {
            const nowInTz = getCurrentTimeMinutes(userTz);
            // Only flag early departure if we're past scheduled end
            if (nowInTz >= scheduledEndMinutes) {
              const actualEndMinutes = extractTimeMinutes(effectiveLeftStr);
              if (actualEndMinutes < scheduledEndMinutes - earlyTolerance) {
                earlyMinutes = scheduledEndMinutes - actualEndMinutes;
                status =
                  status === "late_arrival" ? "late_and_early" : "early_departure";
              }
            } else {
              // Workday still in progress — mark as "working" if currently on time
              if (status === "on_time") {
                status = "working";
              }
            }
          } else {
            const actualEndMinutes = extractTimeMinutes(effectiveLeftStr);
            if (actualEndMinutes < scheduledEndMinutes - earlyTolerance) {
              earlyMinutes = scheduledEndMinutes - actualEndMinutes;
              status =
                status === "late_arrival" ? "late_and_early" : "early_departure";
            }
          }
        }
      }

      // Override: if pre-shift activity continued into the workday, we can't
      // tell their real clock-in. Surface as "inconclusive" rather than guess.
      if (multipleSessionsAmbiguous) {
        status = "inconclusive";
        lateMinutes = null;
        earlyMinutes = null;
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
      mappedUsers: userMap.size,
      debug: {
        isSyncingToday,
        today,
        syncDate,
        serverTime: new Date().toISOString(),
      },
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
// DeskTime returns times in the employee's configured timezone
function parseDesktimeTimestamp(ts: string, dtTimezone?: string): string | null {
  if (!ts || ts === "false") return null;

  const tz = dtTimezone || "Asia/Singapore";

  // Use Intl to get the UTC offset for the given timezone at the given date
  // by formatting a known UTC date and comparing
  try {
    // Parse the local time components
    const [datePart, timePart] = ts.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes, seconds] = (timePart || "00:00:00").split(":").map(Number);

    // Create a date assuming UTC first to get the offset
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

    // Get the timezone offset in minutes using Intl
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(utcGuess);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    const offsetStr = tzPart?.value ?? "GMT";

    // Parse offset like "GMT+8", "GMT+2", "GMT-5", "GMT+5:30"
    let offsetMinutes = 0;
    const match = offsetStr.match(/GMT([+-]?)(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      offsetMinutes = sign * (parseInt(match[2]) * 60 + parseInt(match[3] || "0"));
    }

    // The local time IS in the given timezone, so subtract the offset to get UTC
    const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds) - offsetMinutes * 60 * 1000;
    const result = new Date(utcMs);
    if (isNaN(result.getTime())) return null;
    return result.toISOString();
  } catch {
    return null;
  }
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

// Get current time in minutes for a given timezone
function getCurrentTimeMinutes(tz: string): number {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  return timeToMinutes(timeStr);
}
