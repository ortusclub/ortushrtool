import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { resolveEffectiveRecipients } from "@/lib/email/recipients";
import { getUniversalVars } from "@/lib/email/universal-vars";
import { formatInTimeZone } from "date-fns-tz";

const MANILA_TZ = "Asia/Manila";

type CelebrantUser = {
  id: string;
  email: string;
  full_name: string | null;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  job_title: string | null;
  location: string | null;
  manager_id: string | null;
  birthday: string | null;
  hire_date: string | null;
  regularization_date: string | null;
  holiday_country: string | null;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const todayMMDD = formatInTimeZone(now, MANILA_TZ, "MM-dd");
  const todayYear = parseInt(formatInTimeZone(now, MANILA_TZ, "yyyy"), 10);
  const todayDateStr = formatInTimeZone(now, MANILA_TZ, "yyyy-MM-dd");

  try {
    const [{ data: settings }, { data: users }] = await Promise.all([
      supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["birthday_emails_enabled", "anniversary_emails_enabled"]),
      supabase
        .from("users")
        .select(
          "id, email, full_name, preferred_name, first_name, last_name, department, job_title, location, manager_id, birthday, hire_date, regularization_date, holiday_country"
        )
        .eq("is_active", true),
    ]);

    // Configurable CC lists (fall back to HR + super admins). Resolved once —
    // they don't depend on the celebrant. The celebrant's own manager is CC'd
    // per-user below, on top of these.
    const [birthdayCcBase, anniversaryCcBase] = await Promise.all([
      resolveEffectiveRecipients(supabase, "birthday_greeting_regular"),
      resolveEffectiveRecipients(supabase, "work_anniversary"),
    ]);

    const settingMap = new Map(
      (settings ?? []).map((s) => [s.key, s.value === "true"])
    );
    const birthdayEnabled = settingMap.get("birthday_emails_enabled") ?? false;
    const anniversaryEnabled =
      settingMap.get("anniversary_emails_enabled") ?? false;

    const managerIds = new Set(
      (users ?? [])
        .map((u: CelebrantUser) => u.manager_id)
        .filter((id): id is string => !!id)
    );
    const managerById = new Map<
      string,
      { email: string; full_name: string | null }
    >();
    if (managerIds.size > 0) {
      const { data: managers } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", Array.from(managerIds));
      for (const m of managers ?? [])
        managerById.set(m.id, { email: m.email, full_name: m.full_name });
    }

    let birthdaysSent = 0;
    let anniversariesSent = 0;
    const errors: string[] = [];

    for (const user of (users ?? []) as CelebrantUser[]) {
      const manager = user.manager_id ? managerById.get(user.manager_id) : null;
      // CC = the configured list for that email type + the celebrant's own
      // manager, minus the celebrant themselves.
      const buildCc = (base: string[]) => {
        const set = new Set<string>(base);
        if (manager?.email) set.add(manager.email);
        set.delete(user.email);
        return Array.from(set);
      };
      const birthdayCc = buildCc(birthdayCcBase);
      const anniversaryCc = buildCc(anniversaryCcBase);

      const universal = getUniversalVars(user, manager);

      if (
        birthdayEnabled &&
        user.birthday &&
        user.birthday.slice(5) === todayMMDD
      ) {
        // Interns get a dedicated greeting with no Birthday Leave content,
        // since they aren't granted the leave. Intern = job title matching
        // the whole word "intern" (word boundary avoids "International").
        const isIntern = /\bintern\b/i.test(user.job_title ?? "");
        const isRegular =
          !!user.regularization_date && user.regularization_date <= todayDateStr;
        const birthdayType = isIntern
          ? "birthday_greeting_intern"
          : isRegular
            ? "birthday_greeting_regular"
            : "birthday_greeting_probationary";
        const result = await sendCelebrationEmail({
          type: birthdayType,
          to: user.email,
          cc: birthdayCc,
          vars: universal,
        });
        await logNotification(supabase, {
          type: birthdayType,
          subject: result.subject,
          relatedId: user.id,
          recipients: [user.email, ...birthdayCc],
          success: result.success,
        });
        if (result.success) birthdaysSent++;
        else errors.push(`birthday/${user.email}: ${result.error}`);
      }

      if (
        anniversaryEnabled &&
        user.hire_date &&
        user.hire_date.slice(5) === todayMMDD
      ) {
        const hireYear = parseInt(user.hire_date.slice(0, 4), 10);
        const years = todayYear - hireYear;
        if (years >= 1) {
          let benefitsHtml = "";
          if (user.holiday_country) {
            const { data: benefit } = await supabase
              .from("anniversary_benefits")
              .select("body")
              .eq("country", user.holiday_country)
              .eq("years", years)
              .maybeSingle();
            benefitsHtml = benefit?.body ?? "";
          }
          const result = await sendCelebrationEmail({
            type: "work_anniversary",
            to: user.email,
            cc: anniversaryCc,
            vars: {
              ...universal,
              years_count: String(years),
              benefits_html: benefitsHtml,
            },
          });
          await logNotification(supabase, {
            type: "work_anniversary",
            subject: result.subject,
            relatedId: user.id,
            recipients: [user.email, ...anniversaryCc],
            success: result.success,
          });
          if (result.success) anniversariesSent++;
          else errors.push(`anniversary/${user.email}: ${result.error}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: todayMMDD,
      birthdayEnabled,
      anniversaryEnabled,
      birthdaysSent,
      anniversariesSent,
      errors,
    });
  } catch (error) {
    console.error("Birthday/anniversary email error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Birthday/anniversary email run failed",
      },
      { status: 500 }
    );
  }
}

async function sendCelebrationEmail({
  type,
  to,
  cc,
  vars,
}: {
  type:
    | "birthday_greeting_regular"
    | "birthday_greeting_probationary"
    | "birthday_greeting_intern"
    | "work_anniversary";
  to: string;
  cc: string[];
  vars: Record<string, string>;
}): Promise<{ success: boolean; subject: string; error?: string }> {
  const { subject, html } = await loadAndRender(type, vars);
  const result = await sendEmail({ to, cc, subject, html });
  return { success: result.success, subject, error: result.error };
}

async function logNotification(
  supabase: ReturnType<typeof createAdminClient>,
  {
    type,
    subject,
    relatedId,
    recipients,
    success,
  }: {
    type: string;
    subject: string;
    relatedId: string;
    recipients: string[];
    success: boolean;
  }
) {
  const rows = recipients.map((email) => ({
    type,
    recipient_email: email,
    subject,
    related_id: relatedId,
    status: success ? "sent" : "failed",
  }));
  if (rows.length > 0) {
    await supabase.from("notification_log").insert(rows);
  }
}
