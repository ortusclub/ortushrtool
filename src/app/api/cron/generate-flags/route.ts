import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { flagNotificationEmail } from "@/lib/email/templates";
import { format, subDays } from "date-fns";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const flagDate = format(subDays(new Date(), 1), "yyyy-MM-dd");

  try {
    // Get all attendance logs for the date that have non-compliance
    const { data: logs } = await supabase
      .from("attendance_logs")
      .select(
        "*, employee:users!attendance_logs_employee_id_fkey(id, full_name, email, manager_id)"
      )
      .eq("date", flagDate)
      .in("status", ["late_arrival", "early_departure", "late_and_early", "absent"]);

    // Also find employees with schedules but no attendance log (absent)
    const { data: allActiveUsers } = await supabase
      .from("users")
      .select("id, full_name, email, manager_id, desktime_employee_id")
      .eq("is_active", true)
      .not("desktime_employee_id", "is", null);

    const loggedEmployeeIds = new Set((logs ?? []).map((l) => l.employee_id));

    // Get HR admins for notifications
    const { data: hrAdmins } = await supabase
      .from("users")
      .select("email")
      .in("role", ["hr_admin", "super_admin"])
      .eq("is_active", true);

    const hrEmails = (hrAdmins ?? []).map((a) => a.email);
    let flagsCreated = 0;

    // Process logs with violations
    for (const log of logs ?? []) {
      const employee = log.employee;
      if (!employee) continue;

      const flagTypes: {
        type: string;
        scheduled: string;
        actual: string | null;
        deviation: number;
      }[] = [];

      if (
        log.status === "late_arrival" ||
        log.status === "late_and_early"
      ) {
        flagTypes.push({
          type: "late_arrival",
          scheduled: log.scheduled_start,
          actual: log.clock_in
            ? format(new Date(log.clock_in), "HH:mm")
            : null,
          deviation: log.late_minutes ?? 0,
        });
      }

      if (
        log.status === "early_departure" ||
        log.status === "late_and_early"
      ) {
        flagTypes.push({
          type: "early_departure",
          scheduled: log.scheduled_end,
          actual: log.clock_out
            ? format(new Date(log.clock_out), "HH:mm")
            : null,
          deviation: log.early_departure_minutes ?? 0,
        });
      }

      if (log.status === "absent") {
        flagTypes.push({
          type: "absent",
          scheduled: log.scheduled_start,
          actual: null,
          deviation: 0,
        });
      }

      for (const flag of flagTypes) {
        // Check if flag already exists
        const { data: existing } = await supabase
          .from("attendance_flags")
          .select("id")
          .eq("employee_id", employee.id)
          .eq("flag_date", flagDate)
          .eq("flag_type", flag.type)
          .maybeSingle();

        if (existing) continue;

        // Create flag
        await supabase.from("attendance_flags").insert({
          attendance_log_id: log.id,
          employee_id: employee.id,
          flag_type: flag.type,
          flag_date: flagDate,
          deviation_minutes: flag.deviation,
          scheduled_time: flag.scheduled,
          actual_time: flag.actual,
        });

        flagsCreated++;

        // Send notifications
        const emailHtml = flagNotificationEmail({
          employeeName: employee.full_name || employee.email,
          flagDate,
          flagType: flag.type,
          scheduledTime: flag.scheduled,
          actualTime: flag.actual,
          deviationMinutes: flag.deviation,
        });

        const recipients = [employee.email, ...hrEmails];

        // Add manager email
        if (employee.manager_id) {
          const { data: manager } = await supabase
            .from("users")
            .select("email")
            .eq("id", employee.manager_id)
            .single();

          if (manager) recipients.push(manager.email);
        }

        const uniqueRecipients = [...new Set(recipients)];

        const result = await sendEmail({
          to: uniqueRecipients,
          subject: `Attendance Flag: ${employee.full_name || employee.email} - ${flag.type.replace("_", " ")}`,
          html: emailHtml,
        });

        // Log notification
        for (const email of uniqueRecipients) {
          await supabase.from("notification_log").insert({
            type: "attendance_flag",
            recipient_email: email,
            subject: `Attendance Flag: ${flag.type.replace("_", " ")}`,
            related_id: log.id,
            status: result.success ? "sent" : "failed",
          });
        }
      }
    }

    // Handle employees with no attendance log (potentially absent)
    const dateObj = new Date(flagDate);
    const dayOfWeek = (dateObj.getDay() + 6) % 7;

    for (const user of allActiveUsers ?? []) {
      if (loggedEmployeeIds.has(user.id)) continue;

      // Check if it's a rest day
      const { data: schedule } = await supabase
        .from("schedules")
        .select("is_rest_day, start_time")
        .eq("employee_id", user.id)
        .eq("day_of_week", dayOfWeek)
        .lte("effective_from", flagDate)
        .or(`effective_until.is.null,effective_until.gte.${flagDate}`)
        .limit(1)
        .maybeSingle();

      if (!schedule || schedule.is_rest_day) continue;

      // Check if already flagged
      const { data: existing } = await supabase
        .from("attendance_flags")
        .select("id")
        .eq("employee_id", user.id)
        .eq("flag_date", flagDate)
        .eq("flag_type", "absent")
        .maybeSingle();

      if (existing) continue;

      // Create absent flag
      await supabase.from("attendance_flags").insert({
        employee_id: user.id,
        flag_type: "absent",
        flag_date: flagDate,
        deviation_minutes: 0,
        scheduled_time: schedule.start_time,
      });

      flagsCreated++;
    }

    return NextResponse.json({
      success: true,
      date: flagDate,
      flagsCreated,
    });
  } catch (error) {
    console.error("Flag generation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Flag generation failed",
      },
      { status: 500 }
    );
  }
}
