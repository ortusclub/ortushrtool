import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { loadAndRender } from "@/lib/email/render";
import { getUniversalVars } from "@/lib/email/universal-vars";
import {
  fetchStalePendingRequests,
  fetchStillPendingIds,
  REQUEST_KIND_LABELS,
  type PendingRequestKind,
} from "@/lib/requests/pending";
import { formatInTimeZone } from "date-fns-tz";

const MANILA_TZ = "Asia/Manila";
const MARKER_KEY = "pending_request_reminder_last_run";
const ENABLED_KEY = "pending_request_reminder_emails_enabled";
const DAYS_KEY = "pending_request_reminder_days";
const DEFAULT_DAYS = 2;

type ManagerRow = {
  id: string;
  email: string;
  full_name: string | null;
  preferred_name: string | null;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  job_title: string | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Daily nudge for requests left sitting. Finds every pending leave, schedule
 * adjustment, overtime and holiday-work request older than the configured
 * threshold, raises a reminder flag against the requester's direct manager,
 * and emails each manager a single digest of everything waiting on them.
 *
 * The flag table is derived state — this job also clears flags whose request
 * is no longer pending, so nothing outlives the request it points at.
 *
 * A manager who acknowledges a flag stops receiving it in the digest (they're
 * knowingly sitting on it) but the flag stays visible until the request is
 * actually decided.
 *
 * Idempotent per Manila day via a system_settings marker, so a re-trigger on
 * the same day won't double-send.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const todayTag = formatInTimeZone(now, MANILA_TZ, "yyyy-MM-dd");

  try {
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [ENABLED_KEY, DAYS_KEY, MARKER_KEY]);
    const settingMap = new Map((settings ?? []).map((s) => [s.key, s.value]));

    if (settingMap.get(ENABLED_KEY) !== "true") {
      return NextResponse.json({ sent: 0, message: "reminders disabled" });
    }

    const parsedDays = parseInt(settingMap.get(DAYS_KEY) ?? "", 10);
    const thresholdDays =
      Number.isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : DEFAULT_DAYS;

    // Requests submitted on or before this instant have waited long enough.
    const cutoff = new Date(now.getTime() - thresholdDays * 86_400_000);

    // ─── Retire flags whose request is no longer pending ───
    const { data: existingFlags } = await supabase
      .from("request_reminder_flags")
      .select("id, request_type, request_id");
    const idsByKind = new Map<PendingRequestKind, string[]>();
    for (const f of existingFlags ?? []) {
      const kind = f.request_type as PendingRequestKind;
      if (!idsByKind.has(kind)) idsByKind.set(kind, []);
      idsByKind.get(kind)!.push(f.request_id);
    }
    const stillPending = await fetchStillPendingIds(supabase, idsByKind);
    const resolvedFlagIds = (existingFlags ?? [])
      .filter((f) => !stillPending.has(`${f.request_type}:${f.request_id}`))
      .map((f) => f.id);
    if (resolvedFlagIds.length > 0) {
      await supabase
        .from("request_reminder_flags")
        .delete()
        .in("id", resolvedFlagIds);
    }

    // ─── Find what's stale now ───
    const stale = await fetchStalePendingRequests(
      supabase,
      cutoff.toISOString(),
      now
    );
    if (stale.length === 0) {
      await supabase
        .from("system_settings")
        .upsert({ key: MARKER_KEY, value: todayTag }, { onConflict: "key" });
      return NextResponse.json({
        success: true,
        thresholdDays,
        stale: 0,
        flagsResolved: resolvedFlagIds.length,
        sent: 0,
      });
    }

    // Requester → their manager. A request from someone with no manager set
    // has nobody to chase, so it's counted and skipped rather than dropped
    // silently.
    const employeeIds = Array.from(new Set(stale.map((s) => s.employeeId)));
    const { data: employees } = await supabase
      .from("users")
      .select("id, full_name, preferred_name, first_name, email, manager_id, is_active")
      .in("id", employeeIds);
    const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

    const orphaned: string[] = [];
    const flagRows: Array<Record<string, unknown>> = [];
    for (const s of stale) {
      const emp = employeeById.get(s.employeeId);
      if (!emp || !emp.is_active) continue;
      if (!emp.manager_id) {
        orphaned.push(`${s.kind}:${s.id}`);
        continue;
      }
      flagRows.push({
        request_type: s.kind,
        request_id: s.id,
        employee_id: s.employeeId,
        manager_id: emp.manager_id,
        summary: s.summary,
        pending_since: s.createdAt,
        days_pending: s.daysPending,
      });
    }

    // Upsert on (request_type, request_id): first sighting inserts, later
    // runs just refresh days_pending. `acknowledged` is left alone so a
    // dismissal survives the daily refresh.
    if (flagRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("request_reminder_flags")
        .upsert(flagRows, {
          onConflict: "request_type,request_id",
          ignoreDuplicates: false,
        });
      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }
    }

    // Same-day idempotency: past this point we start sending, so a re-trigger
    // that already ran today stops here (flags above are safe to recompute).
    if (settingMap.get(MARKER_KEY) === todayTag) {
      return NextResponse.json({
        success: true,
        thresholdDays,
        stale: stale.length,
        flagsResolved: resolvedFlagIds.length,
        sent: 0,
        message: `emails already sent for ${todayTag}`,
      });
    }

    // ─── One digest per manager, covering their un-acknowledged flags ───
    const { data: openFlags } = await supabase
      .from("request_reminder_flags")
      .select("id, request_type, request_id, employee_id, manager_id, summary, days_pending")
      .eq("acknowledged", false);

    const byManager = new Map<string, typeof openFlags>();
    for (const f of openFlags ?? []) {
      if (!byManager.has(f.manager_id)) byManager.set(f.manager_id, []);
      byManager.get(f.manager_id)!.push(f);
    }

    const managerIds = Array.from(byManager.keys());
    const { data: managers } = await supabase
      .from("users")
      .select("id, email, full_name, preferred_name, first_name, last_name, department, job_title")
      .in("id", managerIds)
      .eq("is_active", true);
    const managerById = new Map(
      (managers ?? []).map((m) => [m.id, m as ManagerRow])
    );

    let sent = 0;
    const errors: string[] = [];
    const emailedFlagIds: string[] = [];

    for (const [managerId, flags] of byManager) {
      const manager = managerById.get(managerId);
      if (!manager?.email || !flags?.length) continue;

      const sorted = [...flags].sort((a, b) => b.days_pending - a.days_pending);
      const rowsHtml = sorted
        .map((f) => {
          const emp = employeeById.get(f.employee_id);
          const who =
            emp?.full_name || emp?.preferred_name || emp?.email || "An employee";
          const label = REQUEST_KIND_LABELS[f.request_type as PendingRequestKind];
          const age =
            f.days_pending === 1 ? "1 day" : `${f.days_pending} days`;
          return (
            `  <li><strong>${esc(who)}</strong> — ${esc(label)}: ${esc(f.summary)} ` +
            `<em>(waiting ${age})</em></li>`
          );
        })
        .join("\n");

      const oldest = sorted[0].days_pending;
      const { subject, html } = await loadAndRender("pending_request_reminder", {
        ...getUniversalVars(manager, null),
        pending_count: String(sorted.length),
        request_word: sorted.length === 1 ? "request" : "requests",
        oldest_days: String(oldest),
        oldest_days_word: oldest === 1 ? "day" : "days",
        requests_html: `<ul>\n${rowsHtml}\n</ul>`,
      });

      const result = await sendEmail({ to: manager.email, subject, html });
      if (result.success) {
        sent++;
        emailedFlagIds.push(...sorted.map((f) => f.id));
      } else {
        errors.push(`${manager.email}: ${result.error}`);
      }

      await supabase.from("notification_log").insert({
        // notification_log.type is the 3-value enum from the initial schema
        // ('schedule_adjustment_request' | 'schedule_adjustment_decision' |
        // 'attendance_flag') and has no reminder member. The manual Buzz
        // Manager reminder logs every type under schedule_adjustment_request
        // for the same reason; matching it keeps the log consistent until the
        // enum is widened (needs its own ALTER TYPE migration).
        type: "schedule_adjustment_request",
        recipient_email: manager.email,
        subject,
        status: result.success ? "sent" : "failed",
      });
    }

    if (emailedFlagIds.length > 0) {
      await supabase
        .from("request_reminder_flags")
        .update({ last_emailed_at: now.toISOString() })
        .in("id", emailedFlagIds);
    }

    await supabase
      .from("system_settings")
      .upsert({ key: MARKER_KEY, value: todayTag }, { onConflict: "key" });

    return NextResponse.json({
      success: true,
      thresholdDays,
      stale: stale.length,
      flagsRaised: flagRows.length,
      flagsResolved: resolvedFlagIds.length,
      managersEmailed: sent,
      noManager: orphaned.length,
      errors,
    });
  } catch (error) {
    console.error("Pending-request reminder error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Pending-request reminder run failed",
      },
      { status: 500 }
    );
  }
}
