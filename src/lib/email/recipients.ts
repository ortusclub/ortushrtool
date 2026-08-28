import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Admin-configurable recipients for the notification emails that tell HR /
 * admins something needs action. Each such email type can have a
 * `system_settings` row keyed `notify:<type>` holding a JSON
 * `{ roles, emails }`. Routes resolve it at send time and fall back to their
 * built-in default (DEFAULT_RECIPIENTS) when it's unset — see
 * `resolveEffectiveRecipients`.
 */

export const NOTIFY_ROLES = ["hr_admin", "super_admin"] as const;
export type NotifyRole = (typeof NOTIFY_ROLES)[number];

export const NOTIFY_ROLE_LABELS: Record<NotifyRole, string> = {
  hr_admin: "HR Admins",
  super_admin: "Super Admins",
};

/** Notification types whose recipients are editable in the email settings UI. */
export const RECIPIENT_CONFIGURABLE_TYPES = [
  "schedule_weekly_change_submitted",
  "holiday_import_reminder",
  "incident_submitted",
  "p2p_feedback_submitted",
  "document_request_hr_notification",
  "forgot_password_alert",
  // Celebration CC lists (the celebrant is always the To; their manager is
  // always CC'd separately). birthday_greeting_regular's config also drives the
  // probationary birthday email, so there's a single "birthday" recipients box.
  "birthday_greeting_regular",
  "work_anniversary",
  "birthday_leave_reminder",
  "anniversary_benefit_reminder",
] as const;

export type RecipientConfig = { roles: NotifyRole[]; emails: string[] };

/**
 * The built-in default recipients per type — what each email sends to when an
 * admin hasn't configured it. Single source of truth: the routes AND the
 * settings UI both read this, so "Currently sending to…" always matches
 * reality.
 */
export const DEFAULT_RECIPIENTS: Record<string, RecipientConfig> = {
  schedule_weekly_change_submitted: { roles: ["hr_admin", "super_admin"], emails: [] },
  holiday_import_reminder: {
    roles: [],
    emails: ["dfoz@ortusclub.com", "brad.u@ortusclub.com"],
  },
  incident_submitted: {
    roles: [],
    emails: [
      "dfoz@ortusclub.com",
      "jamie@ortusclub.com",
      "damon@ortusclub.com",
      "brad.u@ortusclub.com",
    ],
  },
  p2p_feedback_submitted: {
    roles: [],
    emails: ["brad.u@ortusclub.com", "jamie@ortusclub.com", "dfoz@ortusclub.com"],
  },
  document_request_hr_notification: {
    roles: ["hr_admin", "super_admin"],
    emails: [],
  },
  forgot_password_alert: { roles: ["super_admin"], emails: [] },
  // Celebration CC (in addition to the celebrant's manager, always CC'd).
  birthday_greeting_regular: { roles: ["hr_admin", "super_admin"], emails: [] },
  work_anniversary: { roles: ["hr_admin", "super_admin"], emails: [] },
  // Monthly, so this arrives as one batch of ~10-15 CCs rather than spread
  // across the month like the greetings. Named people rather than the HR
  // role, to keep that batch off everyone else's desk.
  birthday_leave_reminder: {
    roles: [],
    emails: ["dfoz@ortusclub.com", "brad.u@ortusclub.com"],
  },
  // HR needs sight of who is about to lose a benefit — at year 5 that is
  // PHP 12,100 of allowances plus a bonus, so a missed claim is real money.
  anniversary_benefit_reminder: {
    roles: [],
    emails: ["dfoz@ortusclub.com", "brad.u@ortusclub.com"],
  },
};

/**
 * Copy for the recipients box in the settings editor. Most types send only to
 * the configured list, so the default wording is accurate. The celebration
 * emails are the exception: the celebrant is always the To and their manager
 * is always CC'd, neither of which appears in the list — so saying "exactly
 * the people below get this email" (or that an empty list means nobody gets
 * it) would be wrong and could lead an admin to think clearing the list stops
 * the greeting.
 */
export type RecipientCopy = { heading: string; help: string; empty: string };

export const DEFAULT_RECIPIENT_COPY: RecipientCopy = {
  heading: "Recipients",
  help: "Exactly the people below get this email.",
  empty: "No recipients — this email won't be sent to anyone.",
};

const CELEBRATION_EMPTY =
  "No one CC'd — the greeting still goes to the celebrant and their manager.";

export const RECIPIENT_COPY: Record<string, RecipientCopy> = {
  birthday_greeting_regular: {
    heading: "CC",
    help: "The celebrant and their manager always receive this and aren't listed here — the people below are CC'd. This list also applies to probationary birthday greetings.",
    empty: CELEBRATION_EMPTY,
  },
  work_anniversary: {
    heading: "CC",
    help: "The celebrant and their manager always receive this and aren't listed here — the people below are CC'd.",
    empty: CELEBRATION_EMPTY,
  },
  anniversary_benefit_reminder: {
    heading: "CC",
    help: "The employee always receives this and isn't listed here — the people below are CC'd. Sent individually as each person reaches 10 days before their claim deadline, so these arrive a few at a time rather than in one batch.",
    empty: "No one CC'd — the reminder still goes to the employee.",
  },
  birthday_leave_reminder: {
    heading: "CC",
    help: "The celebrant always receives this and isn't listed here — the people below are CC'd. Unlike the birthday greeting, the celebrant's manager is NOT automatically included. Sent as one batch on the 25th, so expect ~10-15 at once.",
    empty:
      "No one CC'd — the reminder still goes to each celebrant.",
  },
};

/** Copy for a type's recipients box, falling back to the default wording. */
export function recipientCopy(type: string): RecipientCopy {
  return RECIPIENT_COPY[type] ?? DEFAULT_RECIPIENT_COPY;
}

export function notifyKey(type: string): string {
  return `notify:${type}`;
}

/** Parse a stored system_settings value into a RecipientConfig, or null. */
export function parseRecipientConfig(
  value: string | null | undefined
): RecipientConfig | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { roles?: unknown; emails?: unknown };
    const roles = Array.isArray(parsed.roles)
      ? parsed.roles.filter((r): r is NotifyRole =>
          (NOTIFY_ROLES as readonly string[]).includes(r as string)
        )
      : [];
    const emails = Array.isArray(parsed.emails)
      ? parsed.emails
          .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
          .map((e) => e.trim())
      : [];
    return { roles, emails };
  } catch {
    return null;
  }
}

/** Read the stored (admin-set) config for a type, or null if unconfigured. */
export async function getStoredConfig(
  admin: SupabaseClient<any, any, any>,
  type: string
): Promise<RecipientConfig | null> {
  const { data } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", notifyKey(type))
    .maybeSingle();
  return parseRecipientConfig(data?.value as string | undefined);
}

/** Resolve a config (roles → active users' emails, merged with explicit). */
async function resolveConfig(
  admin: SupabaseClient<any, any, any>,
  cfg: RecipientConfig
): Promise<string[]> {
  const emails = new Set<string>(cfg.emails);
  if (cfg.roles.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("email")
      .in("role", cfg.roles)
      .eq("is_active", true);
    for (const u of users ?? []) if (u.email) emails.add(u.email as string);
  }
  return Array.from(emails);
}

/**
 * The recipients a notification `type` sends to right now — the admin-set
 * config if present, otherwise the built-in default. This is what both the
 * routes and the settings UI use, so they never disagree.
 */
export async function resolveEffectiveRecipients(
  admin: SupabaseClient<any, any, any>,
  type: string
): Promise<string[]> {
  const cfg =
    (await getStoredConfig(admin, type)) ??
    DEFAULT_RECIPIENTS[type] ?? { roles: [], emails: [] };
  return resolveConfig(admin, cfg);
}
