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

  // Overtime
  overtime_submitted: {
    sentWhen:
      "Sent when an employee (flagged by HR as overtime-eligible) submits an overtime request. To: their manager.",
  },
  overtime_approved: {
    sentWhen:
      "Sent when an overtime request is approved. To: the employee, manager, and reviewer.",
  },
  overtime_rejected: {
    sentWhen:
      "Sent when an overtime request is rejected. To: the employee, manager, and reviewer.",
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
      "Sent at 9:00 AM Manila on each REGULAR employee's birthday (someone whose Regularization Date is set and on or before today). To: the celebrant. CC: their manager, plus the CC list configured below.",
    toggleKey: "birthday_emails_enabled",
    toggleLabel: "Send birthday emails",
  },
  birthday_greeting_probationary: {
    sentWhen:
      "Sent at 9:00 AM Manila on each PROBATIONARY employee's birthday (someone with no Regularization Date, or one in the future) who is NOT an intern. To: the celebrant. CC: their manager, plus the CC list configured on the regular birthday template above.",
    toggleKey: "birthday_emails_enabled",
    toggleLabel: "Send birthday emails",
  },
  birthday_greeting_intern: {
    sentWhen:
      "Sent at 9:00 AM Manila on the birthday of any employee whose job title contains 'Intern', in place of the regular/probationary greeting. Interns don't receive Birthday Leave, so this version omits the leave details. To: the celebrant. CC: their manager, plus the birthday CC list. Controlled by the same on/off toggle as the other birthday greetings.",
    toggleKey: "birthday_emails_enabled",
    toggleLabel: "Send birthday emails",
  },
  work_anniversary: {
    sentWhen:
      "Sent at 9:00 AM Manila on each user's work anniversary (year 1 onwards — skips day-of-hire). To: the celebrant. CC: their manager, plus the CC list configured below. The benefits section auto-fills from Anniversary Benefits when one is defined for the user's country + year count; otherwise the section is omitted.",
    toggleKey: "anniversary_emails_enabled",
    toggleLabel: "Send work anniversary emails",
  },
  birthday_leave_reminder: {
    sentWhen:
      "Sent at 9:00 AM Manila on the 25th of each month to every active NON-INTERN employee whose birthday falls in the FOLLOWING month, letting them know their Birthday Leave opens on the 1st. Amount is a full day, or a half day for anyone still under 6 months' tenure during their birth month (matching the auto-grant rule). To: the celebrant only.",
    toggleKey: "birthday_leave_reminder_emails_enabled",
    toggleLabel: "Send birthday-leave reminder emails",
  },

  // Document requests
  document_request_employee_copy: {
    sentWhen:
      "Sent to the employee right after they submit a document request, echoing the details they entered as a confirmation receipt.",
  },
  document_request_hr_notification: {
    sentWhen:
      "Sent to all active HR users when an employee submits a document request, with a link to the HR queue at /admin/document-requests.",
  },

  // Reminders
  reminder: {
    sentWhen:
      "Sent when an employee clicks 'Buzz Manager' on a pending request they've submitted. To: their manager.",
  },

  // Permanent schedule changes
  schedule_weekly_change_submitted: {
    sentWhen:
      "Sent when a manager or employee submits a PERMANENT weekly schedule change (which needs admin approval). To: all active HR admins + super-admins.",
  },

  // Holidays
  holiday_import_reminder: {
    sentWhen:
      "Sent by the yearly holiday cron (early December) after staging next year's public holidays for approval. To: the holiday reviewers.",
  },

  // Workplace concerns & peer feedback
  incident_submitted: {
    sentWhen:
      "Sent when an employee files a workplace concern / incident report. To: all active HR admins.",
  },
  p2p_feedback_submitted: {
    sentWhen:
      "Sent when someone submits peer feedback that needs HR review. To: all active HR admins.",
  },
};

/** Setting keys controlled by template-level toggles. */
export const TEMPLATE_TOGGLE_KEYS: string[] = Object.values(TEMPLATE_META)
  .map((m) => m.toggleKey)
  .filter((k): k is string => !!k);
