const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function flagNotificationEmail({
  employeeName,
  flagDate,
  flagType,
  scheduledTime,
  actualTime,
  deviationMinutes,
}: {
  employeeName: string;
  flagDate: string;
  flagType: string;
  scheduledTime: string;
  actualTime: string | null;
  deviationMinutes: number;
}): string {
  const flagLabels: Record<string, string> = {
    late_arrival: "Late Arrival",
    early_departure: "Early Departure",
    absent: "Absent",
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f2937;">Attendance Flag</h2>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-weight: bold; color: #991b1b;">${flagLabels[flagType] ?? flagType}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280;">Employee</td><td style="padding: 8px 0; font-weight: bold;">${employeeName}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Date</td><td style="padding: 8px 0;">${flagDate}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Scheduled Time</td><td style="padding: 8px 0;">${scheduledTime}</td></tr>
        ${actualTime ? `<tr><td style="padding: 8px 0; color: #6b7280;">Actual Time</td><td style="padding: 8px 0;">${actualTime}</td></tr>` : ""}
        <tr><td style="padding: 8px 0; color: #6b7280;">Deviation</td><td style="padding: 8px 0; font-weight: bold; color: #dc2626;">${deviationMinutes} minutes</td></tr>
      </table>
      <a href="${APP_URL}/flags" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">View in App</a>
    </div>
  `;
}

export function adjustmentRequestEmail({
  employeeName,
  requestedDate,
  originalTime,
  requestedTime,
  reason,
  adjustmentId,
}: {
  employeeName: string;
  requestedDate: string;
  originalTime: string;
  requestedTime: string;
  reason: string;
  adjustmentId: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f2937;">Schedule Adjustment Request</h2>
      <p>${employeeName} has requested a schedule adjustment.</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280;">Date</td><td style="padding: 8px 0;">${requestedDate}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Original Schedule</td><td style="padding: 8px 0;">${originalTime}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Requested Schedule</td><td style="padding: 8px 0; font-weight: bold;">${requestedTime}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Reason</td><td style="padding: 8px 0;">${reason}</td></tr>
      </table>
      <a href="${APP_URL}/adjustments" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Review Request</a>
    </div>
  `;
}

export function adjustmentDecisionEmail({
  employeeName,
  requestedDate,
  requestedTime,
  status,
  reviewerNotes,
}: {
  employeeName: string;
  requestedDate: string;
  requestedTime: string;
  status: "approved" | "rejected";
  reviewerNotes: string | null;
}): string {
  const isApproved = status === "approved";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f2937;">Schedule Adjustment ${isApproved ? "Approved" : "Rejected"}</h2>
      <div style="background: ${isApproved ? "#f0fdf4" : "#fef2f2"}; border: 1px solid ${isApproved ? "#bbf7d0" : "#fecaca"}; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-weight: bold; color: ${isApproved ? "#166534" : "#991b1b"};">
          Your schedule adjustment request for ${requestedDate} has been ${status}.
        </p>
      </div>
      <p><strong>Requested Schedule:</strong> ${requestedTime}</p>
      ${reviewerNotes ? `<p><strong>Manager Notes:</strong> ${reviewerNotes}</p>` : ""}
      <a href="${APP_URL}/adjustments" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">View Details</a>
    </div>
  `;
}
