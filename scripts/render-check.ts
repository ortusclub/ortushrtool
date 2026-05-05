import { applyEmailStyles } from "../src/lib/email/styles";
import { EMAIL_TEMPLATE_DEFAULTS } from "../src/lib/email/template-defaults";

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, content) => (vars[key] ? content : "")
  );
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
  return result;
}

const sample: Record<string, string> = {
  preferred_name: "Jamie",
  full_name: "Jamie Lianeaclan",
  first_name: "Jamie",
  last_name: "Lianeaclan",
  email: "jamie@ortus.solutions",
  department: "Engineering",
  job_title: "Engineer",
  location: "Manila",
  manager_name: "Maria Cruz",
  manager_email: "maria@ortus.solutions",
  today_date: "May 5, 2026",
  employee_name: "Jamie",
  reset_link: "https://example.com/reset?token=abc",
  leave_type: "Vacation",
  start_date: "2026-05-10",
  end_date: "2026-05-12",
  reason: "Family trip",
  notes: "Approved by Maria",
  flag_type: "Late Arrival",
  flag_date: "2026-05-04",
  scheduled_time: "09:00",
  actual_time: "09:23",
  deviation_minutes: "23",
  years_count: "3",
  employee_email: "jamie@ortus.solutions",
  details: "<ul><li><strong>Type:</strong> Leave</li></ul>",
  request_type: "Leave",
  requested_date: "2026-05-10",
  requested_time: "10:00 - 19:00",
  original_time: "09:00 - 18:00",
  holiday_name: "Independence Day",
  holiday_date: "2026-06-12",
  start_time: "09:00",
  end_time: "17:00",
};

let issues = 0;
for (const tmpl of EMAIL_TEMPLATE_DEFAULTS) {
  const rendered = applyEmailStyles(renderTemplate(tmpl.body, sample));
  const unfilled = rendered.match(/\{\{[^}]+\}\}/g);
  const remainingClasses = rendered.match(/class="[^"]+"/g);
  if (unfilled) {
    console.log(`[ISSUE] ${tmpl.type}: unfilled vars`, unfilled);
    issues++;
  } else if (remainingClasses) {
    console.log(`[ISSUE] ${tmpl.type}: classes not converted`, remainingClasses);
    issues++;
  } else {
    console.log(`[OK]    ${tmpl.type}`);
  }
}
console.log(`\n${issues === 0 ? "All templates render cleanly." : `${issues} issue(s).`}`);
