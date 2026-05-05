/**
 * Default email templates used to seed the database.
 *
 * Bodies are stored as clean semantic HTML so they edit cleanly in the
 * visual editor. The render pipeline (see `applyEmailStyles` in styles.ts)
 * wraps the body in a container and converts class hooks like `button` and
 * `banner-success` into inline styles at send time.
 */

export interface EmailTemplateDefault {
  type: string;
  name: string;
  subject: string;
  body: string;
  variables: string;
}

function fields(rows: [string, string][]): string {
  return (
    `<ul>\n` +
    rows.map(([k, v]) => `  <li><strong>${k}:</strong> ${v}</li>`).join("\n") +
    `\n</ul>`
  );
}

function button(label: string, url: string, variant?: "purple" | "teal"): string {
  const cls = variant ? `button-${variant}` : "button";
  return `<p><a class="${cls}" href="${url}">${label}</a></p>`;
}

export const EMAIL_TEMPLATE_DEFAULTS: EmailTemplateDefault[] = [
  // ── Authentication ──
  {
    type: "welcome",
    name: "Welcome / Account Setup",
    subject: "Welcome to Ortus Club HR — Set Up Your Password",
    body: [
      `<h2>Welcome to Ortus Club HR</h2>`,
      `<p>Hi {{employee_name}},</p>`,
      `<p>Your account has been created. Please click the button below to set your password and get started:</p>`,
      button("Set Up Your Password", "{{reset_link}}"),
      `<p class="muted">If you have an @ortusclub.com email, you can also sign in directly with Google.</p>`,
    ].join("\n"),
    variables: "employee_name, reset_link",
  },
  {
    type: "password_reset",
    name: "Password Reset (Admin)",
    subject: "Reset Your Password — Ortus Club HR",
    body: [
      `<h2>Reset Your Password</h2>`,
      `<p>An administrator has initiated a password reset for your account.</p>`,
      `<p>Click the button below to set a new password:</p>`,
      button("Reset Password", "{{reset_link}}"),
      `<p class="muted">If you did not request this, you can ignore this email.</p>`,
    ].join("\n"),
    variables: "reset_link",
  },
  {
    type: "forgot_password_alert",
    name: "Forgot Password Alert (to Admins)",
    subject: "Password Reset Request: {{employee_name}}",
    body: [
      `<h2>Password Reset Request</h2>`,
      `<p class="banner-warning"><strong>{{employee_name}}</strong> ({{employee_email}}) is requesting a password reset.</p>`,
      `<p>Please go to the Users page to send them a password reset email.</p>`,
      button("Go to Users", "{{app_url}}/admin/users"),
    ].join("\n"),
    variables: "employee_name, employee_email, app_url",
  },

  // ── Leave ──
  {
    type: "leave_submitted",
    name: "Leave Request Submitted",
    subject: "Leave Request from {{employee_name}}",
    body: [
      `<h2>Leave Request</h2>`,
      `<p>{{employee_name}} has submitted a leave request.</p>`,
      fields([
        ["Type", "{{leave_type}}"],
        ["From", "{{start_date}}"],
        ["To", "{{end_date}}"],
        ["Reason", "{{reason}}"],
      ]),
      button("Review Request", "{{app_url}}/requests", "purple"),
    ].join("\n"),
    variables: "employee_name, leave_type, start_date, end_date, reason, app_url",
  },
  {
    type: "leave_approved",
    name: "Leave Approved",
    subject: "Leave Approved: {{employee_name}} — {{leave_type}}",
    body: [
      `<h2>Leave Request Approved</h2>`,
      `<p class="banner-success">{{employee_name}}'s {{leave_type}} request has been approved.</p>`,
      fields([
        ["Employee", "{{employee_name}}"],
        ["Type", "{{leave_type}}"],
        ["Dates", "{{start_date}} to {{end_date}}"],
        ["Reason", "{{reason}}"],
      ]),
      `{{#if notes}}<p><strong>Notes:</strong> {{notes}}</p>{{/if}}`,
      button("View in App", "{{app_url}}/requests"),
    ].join("\n"),
    variables: "employee_name, leave_type, start_date, end_date, reason, notes, app_url",
  },
  {
    type: "leave_rejected",
    name: "Leave Rejected",
    subject: "Leave Rejected: {{employee_name}} — {{leave_type}}",
    body: [
      `<h2>Leave Request Rejected</h2>`,
      `<p class="banner-danger">{{employee_name}}'s {{leave_type}} request has been rejected.</p>`,
      fields([
        ["Employee", "{{employee_name}}"],
        ["Type", "{{leave_type}}"],
        ["Dates", "{{start_date}} to {{end_date}}"],
        ["Reason", "{{reason}}"],
      ]),
      `{{#if notes}}<p><strong>Notes:</strong> {{notes}}</p>{{/if}}`,
      button("View in App", "{{app_url}}/requests"),
    ].join("\n"),
    variables: "employee_name, leave_type, start_date, end_date, reason, notes, app_url",
  },

  // ── Schedule Adjustments ──
  {
    type: "adjustment_submitted",
    name: "Schedule Adjustment Submitted",
    subject: "Schedule Adjustment Request from {{employee_name}}",
    body: [
      `<h2>Schedule Adjustment Request</h2>`,
      `<p>{{employee_name}} has requested a schedule adjustment.</p>`,
      fields([
        ["Date", "{{requested_date}}"],
        ["Original Schedule", "{{original_time}}"],
        ["Requested Schedule", "{{requested_time}}"],
        ["Reason", "{{reason}}"],
      ]),
      button("Review Request", "{{app_url}}/adjustments"),
    ].join("\n"),
    variables: "employee_name, requested_date, original_time, requested_time, reason, app_url",
  },
  {
    type: "adjustment_approved",
    name: "Schedule Adjustment Approved",
    subject: "Schedule Adjustment Approved — {{employee_name}}",
    body: [
      `<h2>Schedule Adjustment Approved</h2>`,
      `<p class="banner-success">Your schedule adjustment request for {{requested_date}} has been approved.</p>`,
      `<p><strong>Requested Schedule:</strong> {{requested_time}}</p>`,
      `{{#if notes}}<p><strong>Manager Notes:</strong> {{notes}}</p>{{/if}}`,
      button("View Details", "{{app_url}}/adjustments"),
    ].join("\n"),
    variables: "employee_name, requested_date, requested_time, notes, app_url",
  },
  {
    type: "adjustment_rejected",
    name: "Schedule Adjustment Rejected",
    subject: "Schedule Adjustment Rejected — {{employee_name}}",
    body: [
      `<h2>Schedule Adjustment Rejected</h2>`,
      `<p class="banner-danger">Your schedule adjustment request for {{requested_date}} has been rejected.</p>`,
      `<p><strong>Requested Schedule:</strong> {{requested_time}}</p>`,
      `{{#if notes}}<p><strong>Manager Notes:</strong> {{notes}}</p>{{/if}}`,
      button("View Details", "{{app_url}}/adjustments"),
    ].join("\n"),
    variables: "employee_name, requested_date, requested_time, notes, app_url",
  },

  // ── Holiday Work ──
  {
    type: "holiday_work_submitted",
    name: "Holiday Work Request Submitted",
    subject: "Holiday Work Request from {{employee_name}}",
    body: [
      `<h2>Work on Holiday Request</h2>`,
      `<p>{{employee_name}} is requesting to work on a holiday.</p>`,
      fields([
        ["Holiday", "{{holiday_name}}"],
        ["Date", "{{holiday_date}}"],
        ["Hours", "{{start_time}} - {{end_time}}"],
        ["Location", "{{location}}"],
        ["Reason", "{{reason}}"],
      ]),
      button("Review Request", "{{app_url}}/requests", "teal"),
    ].join("\n"),
    variables: "employee_name, holiday_name, holiday_date, start_time, end_time, location, reason, app_url",
  },
  {
    type: "holiday_work_approved",
    name: "Holiday Work Approved",
    subject: "Holiday Work Approved: {{employee_name}} — {{holiday_name}}",
    body: [
      `<h2>Holiday Work Request Approved</h2>`,
      `<p class="banner-success">{{employee_name}}'s request to work on {{holiday_name}} has been approved.</p>`,
      fields([
        ["Employee", "{{employee_name}}"],
        ["Holiday", "{{holiday_name}}"],
        ["Date", "{{holiday_date}}"],
        ["Hours", "{{start_time}} - {{end_time}}"],
        ["Location", "{{location}}"],
      ]),
      `{{#if notes}}<p><strong>Notes:</strong> {{notes}}</p>{{/if}}`,
      button("View in App", "{{app_url}}/requests"),
    ].join("\n"),
    variables: "employee_name, holiday_name, holiday_date, start_time, end_time, location, notes, app_url",
  },
  {
    type: "holiday_work_rejected",
    name: "Holiday Work Rejected",
    subject: "Holiday Work Rejected: {{employee_name}} — {{holiday_name}}",
    body: [
      `<h2>Holiday Work Request Rejected</h2>`,
      `<p class="banner-danger">{{employee_name}}'s request to work on {{holiday_name}} has been rejected.</p>`,
      fields([
        ["Employee", "{{employee_name}}"],
        ["Holiday", "{{holiday_name}}"],
        ["Date", "{{holiday_date}}"],
        ["Hours", "{{start_time}} - {{end_time}}"],
        ["Location", "{{location}}"],
      ]),
      `{{#if notes}}<p><strong>Notes:</strong> {{notes}}</p>{{/if}}`,
      button("View in App", "{{app_url}}/requests"),
    ].join("\n"),
    variables: "employee_name, holiday_name, holiday_date, start_time, end_time, location, notes, app_url",
  },

  // ── Attendance ──
  {
    type: "attendance_flag",
    name: "Attendance Flag",
    subject: "Attendance Flag: {{employee_name}} - {{flag_type}}",
    body: [
      `<h2>Attendance Flag</h2>`,
      `<p class="banner-danger">{{flag_type}}</p>`,
      fields([
        ["Employee", "{{employee_name}}"],
        ["Date", "{{flag_date}}"],
        ["Scheduled Time", "{{scheduled_time}}"],
        ["Deviation", "{{deviation_minutes}} minutes"],
      ]),
      `{{#if actual_time}}<p><strong>Actual Time:</strong> {{actual_time}}</p>{{/if}}`,
      button("View in App", "{{app_url}}/flags"),
    ].join("\n"),
    variables: "employee_name, flag_date, flag_type, scheduled_time, actual_time, deviation_minutes, app_url",
  },

  // ── Celebrations ──
  {
    type: "birthday_greeting_regular",
    name: "Birthday Greeting (Regular Employee)",
    subject: "Happy Birthday, {{preferred_name}}!",
    body: [
      `<h2>Happy Birthday, {{preferred_name}}!</h2>`,
      `<p>The whole Ortus Club team is wishing you a wonderful birthday today.</p>`,
      `<p>Thank you for being part of what makes this team great. Enjoy your day!</p>`,
      `<p>— The Ortus Club Team</p>`,
    ].join("\n"),
    variables: "",
  },
  {
    type: "birthday_greeting_probationary",
    name: "Birthday Greeting (Probationary Employee)",
    subject: "Happy Birthday, {{preferred_name}}!",
    body: [
      `<h2>Happy Birthday, {{preferred_name}}!</h2>`,
      `<p>Wishing you a wonderful birthday from everyone at Ortus Club.</p>`,
      `<p>We're glad to have you on board, and we hope you have a great day!</p>`,
      `<p>— The Ortus Club Team</p>`,
    ].join("\n"),
    variables: "",
  },
  {
    type: "work_anniversary",
    name: "Work Anniversary",
    subject: "Happy {{years_count}}-Year Work Anniversary, {{preferred_name}}!",
    body: [
      `<h2>Happy Work Anniversary, {{preferred_name}}!</h2>`,
      `<p>Today marks <strong>{{years_count}} year(s)</strong> with Ortus Club — what a milestone.</p>`,
      `<p>Thank you for the energy, care, and craft you bring to the team. Here's to many more.</p>`,
      `<p>— The Ortus Club Team</p>`,
    ].join("\n"),
    variables: "years_count",
  },

  // ── Reminders ──
  {
    type: "reminder",
    name: "Pending Approval Reminder",
    subject: "Reminder: {{request_type}} Request from {{employee_name}}",
    body: [
      `<h2>Pending Approval Reminder</h2>`,
      `<p>{{employee_name}} is waiting for your approval on a pending request.</p>`,
      `{{details}}`,
      button("Review Request", "{{app_url}}/requests"),
    ].join("\n"),
    variables: "employee_name, request_type, details, app_url",
  },
];
