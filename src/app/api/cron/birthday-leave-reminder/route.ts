import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";
import { resolveEffectiveRecipients } from "@/lib/email/recipients";
import { addMonths, endOfMonth, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const MANILA_TZ = "Asia/Manila";
const MARKER_KEY = "birthday_leave_reminder_last_month";

type CelebrantUser = {
  id: string;
  email: string;
  full_name: string | null;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  job_title: string | null;
  birthday: string | null;
  hire_date: string | null;
};

/**
 * Monthly heads-up cron. On the 25th (Manila), emails every active employee
 * whose birthday falls in the FOLLOWING month, telling them their Birthday
 * Leave opens on the 1st.
 *
 * The full-day vs half-day amount mirrors grant-birthday-credits exactly:
 * a full day if the employee's 6-month tenure mark falls on or before the
 * last day of their birth month, otherwise a half day.
 *
 * Idempotent at month granularity via a system_settings marker, so an
 * accidental re-trigger in the same month won't double-send.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const todayDay = parseInt(formatInTimeZone(now, MANILA_TZ, "dd"), 10);
  const todayMonth = parseInt(formatInTimeZone(now, MANILA_TZ, "MM"), 10);
  const todayYear = parseInt(formatInTimeZone(now, MANILA_TZ, "yyyy"), 10);

  // Only fire on the 25th. A stray trigger on any other day no-ops.
  if (todayDay !== 25) {
    return NextResponse.json({ sent: 0, message: "not the 25th" });
  }

  // The target ("birth") month is next month.
  let targetYear = todayYear;
  let targetMonth = todayMonth + 1;
  if (targetMonth === 13) {
    targetMonth = 1;
    targetYear += 1;
  }
  const targetTag = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  const firstDay = new Date(targetYear, targetMonth - 1, 1);
  const lastDay = endOfMonth(firstDay);
  const birthMonthName = format(firstDay, "MMMM");
  const availableFrom = format(firstDay, "MMMM d, yyyy");
  const expiresOn = format(lastDay, "MMMM d, yyyy");

  try {
    // Enabled toggle (defaults off until switched on in /admin/settings/emails).
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["birthday_leave_reminder_emails_enabled", MARKER_KEY]);
    const settingMap = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const enabled =
      settingMap.get("birthday_leave_reminder_emails_enabled") === "true";
    if (!enabled) {
      return NextResponse.json({ sent: 0, message: "reminder emails disabled" });
    }

    // Month-level idempotency: skip if we've already run for this target month.
    if (settingMap.get(MARKER_KEY) === targetTag) {
      return NextResponse.json({
        sent: 0,
        message: `already sent for ${targetTag}`,
      });
    }

    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select(
        "id, email, full_name, preferred_name, first_name, last_name, department, job_title, birthday, hire_date"
      )
      .eq("is_active", true)
      .not("birthday", "is", null)
      .not("hire_date", "is", null);
    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    // Whose birth month is the target (next) month, excluding interns —
    // interns don't get Birthday Leave, so they aren't emailed here at all.
    // Intern = job title matching the whole word "intern" (word boundary
    // avoids matching e.g. "International"); the only available signal.
    const candidates = (users ?? []).filter(
      (u: CelebrantUser) =>
        parseInt(u.birthday!.slice(5, 7), 10) === targetMonth &&
        !/\bintern\b/i.test(u.job_title ?? "")
    ) as CelebrantUser[];

    // CC list is admin-configurable at /admin/settings/emails and resolved
    // once — it doesn't vary by celebrant. Unlike the birthday greeting, the
    // celebrant's own manager is NOT added: this fires as a single monthly
    // batch, so every manager with a report in it would be copied on the lot.
    const ccBase = await resolveEffectiveRecipients(
      supabase,
      "birthday_leave_reminder"
    );

    let sent = 0;
    const errors: string[] = [];

    for (const user of candidates) {
      // Tenure rule — identical to grant-birthday-credits.
      const sixMoMark = addMonths(parseISO(user.hire_date!), 6);
      const days = sixMoMark <= lastDay ? 1 : 0.5;
      const isHalf = days === 0.5;
      const { subject, html } = await loadAndRender("birthday_leave_reminder", {
        ...getUniversalVars(user, null),
        birth_month: birthMonthName,
        leave_amount: isHalf ? "a half day (½ day)" : "a full day",
        available_from: availableFrom,
        expires_on: expiresOn,
        days_count: String(days),
        is_half_day: isHalf ? "true" : "",
      });

      // Never CC someone their own reminder.
      const cc = ccBase.filter((e) => e !== user.email);
      const result = await sendEmail({ to: user.email, cc, subject, html });
      if (result.success) sent++;
      else errors.push(`${user.email}: ${result.error}`);
    }

    // Mark this target month done so a re-trigger won't double-send.
    await supabase
      .from("system_settings")
      .upsert({ key: MARKER_KEY, value: targetTag }, { onConflict: "key" });

    return NextResponse.json({
      success: true,
      targetMonth: targetTag,
      candidates: candidates.length,
      sent,
      cc: ccBase,
      errors,
    });
  } catch (error) {
    console.error("Birthday-leave reminder error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Birthday-leave reminder run failed",
      },
      { status: 500 }
    );
  }
}
