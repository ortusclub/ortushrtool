/**
 * Per-template metadata shown in the admin editor: a human-readable
 * description of when the email is sent and who receives it, plus the
 * `system_settings` toggle key for templates that can be turned on/off.
 *
 * Most templates are transactional and always send (no toggle key).
 */

export type TemplateMeta = {
  /** When the email fires and who gets it. Plain prose, shown above the body. */
  sentWhen: string;
  /** `system_settings.key` controlling whether this template sends. */
  toggleKey?: string;
  /** Label shown next to the toggle. */
  toggleLabel?: string;
};

export const TEMPLATE_META: Record<string, TemplateMeta> = {
  // Authentication
  welcome: {
    sentWhen:
      "Sent when an admin creates a new user. To: the new user (so they can set their password).",
  },
  password_reset: {
    sentWhen:
      "Sent when an admin manually triggers a password reset for a user. To: that user.",
  },
  forgot_password_alert: {
    sentWhen:
      "Sent when a user clicks 'Forgot password' on the login page. To: all super-admins.",
  },

  // Leave
  leave_submitted: {
    sentWhen:
      "Sent when an employee submits a leave request. To: their manager.",
  },
  leave_approved: {
    sentWhen:
      "Sent when a leave request is approved. To: the employee. CC: their manager (and the reviewer if different).",
  },
  leave_rejected: {
    sentWhen:
      "Sent when a leave request is rejected. To: the employee. CC: their manager (and the reviewer if different).",
  },

  // Schedule adjustments
  adjustment_submitted: {
    sentWhen:
      "Sent when an employee submits a schedule adjustment request. To: their manager.",
  },
  adjustment_approved: {
    sentWhen:
      "Sent when a schedule adjustment is approved. To: the employee, manager, and reviewer.",
  },
  adjustment_rejected: {
    sentWhen:
      "Sent when a schedule adjustment is rejected. To: the employee, manager, and reviewer.",
  },

  // Holiday work
  holiday_work_submitted: {
    sentWhen:
      "Sent when an employee requests to work on a holiday. To: their manager.",
  },
  holiday_work_approved: {
    sentWhen:
      "Sent when a holiday-work request is approved. To: the employee, manager, and reviewer.",
  },
  holiday_work_rejected: {
    sentWhen:
      "Sent when a holiday-work request is rejected. To: the employee, manager, and reviewer.",
  },

  // Attendance
  attendance_flag: {
    sentWhen:
      "Sent at 11:00 PM Manila daily for any attendance violations from that day. To: the flagged employee. CC: their manager and all HR users.",
    toggleKey: "attendance_flag_emails_enabled",
    toggleLabel: "Send attendance flag emails",
  },

  // Celebrations
  birthday_greeting_regular: {
    sentWhen:
      "Sent at 9:00 AM Manila on each REGULAR employee's birthday (someone whose Regularization Date is set and on or before today). To: the celebrant. CC: their manager and all HR users.",
    toggleKey: "birthday_emails_enabled",
    toggleLabel: "Send birthday emails",
  },
  birthday_greeting_probationary: {
    sentWhen:
      "Sent at 9:00 AM Manila on each PROBATIONARY employee's birthday (someone with no Regularization Date, or one in the future). To: the celebrant. CC: their manager and all HR users.",
    toggleKey: "birthday_emails_enabled",
    toggleLabel: "Send birthday emails",
  },
  work_anniversary: {
    sentWhen:
      "Sent at 9:00 AM Manila on each user's work anniversary (year 1 onwards — skips day-of-hire). To: the celebrant. CC: their manager and all HR users.",
    toggleKey: "anniversary_emails_enabled",
    toggleLabel: "Send work anniversary emails",
  },

  // Reminders
  reminder: {
    sentWhen:
      "Sent when an employee clicks 'Buzz Manager' on a pending request they've submitted. To: their manager.",
  },
};

/** Setting keys controlled by template-level toggles. */
export const TEMPLATE_TOGGLE_KEYS: string[] = Object.values(TEMPLATE_META)
  .map((m) => m.toggleKey)
  .filter((k): k is string => !!k);
