export type UserRole = "employee" | "manager" | "hr_admin" | "super_admin";
export type AdjustmentStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus =
  | "on_time"
  | "late_arrival"
  | "early_departure"
  | "late_and_early"
  | "absent"
  | "rest_day"
  | "on_leave"
  | "holiday"
  | "working";
export type FlagType = "late_arrival" | "early_departure" | "absent";
export type WorkLocation = "office" | "online";
export type LeaveType =
  | "anniversary"
  | "annual"
  | "birthday"
  | "cto"
  | "trinity"
  | "maternity_paternity"
  | "solo_parent"
  | "bereavement";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type HolidayCountry = "PH" | "XK" | "IT" | "AE";

export const HOLIDAY_COUNTRY_LABELS: Record<HolidayCountry, string> = {
  PH: "Philippines",
  XK: "Kosovo",
  IT: "Italy",
  AE: "Dubai (UAE)",
};

export type NotificationType =
  | "schedule_adjustment_request"
  | "schedule_adjustment_decision"
  | "attendance_flag"
  | "leave_request"
  | "leave_decision"
  | "holiday_work_request"
  | "holiday_work_decision";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  manager_id: string | null;
  department: string | null;
  job_title: string | null;
  location: string | null;
  desktime_employee_id: number | null;
  timezone: string;
  holiday_country: HolidayCountry;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  employee_id: string;
  day_of_week: number; // 0=Monday, 6=Sunday
  start_time: string;
  end_time: string;
  is_rest_day: boolean;
  work_location: WorkLocation;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
}

export type ScheduleAdjustmentType = "time" | "location" | "both";

export interface ScheduleAdjustment {
  id: string;
  employee_id: string;
  requested_date: string;
  adjustment_type: ScheduleAdjustmentType;
  original_start_time: string;
  original_end_time: string;
  requested_start_time: string;
  requested_end_time: string;
  requested_work_location: WorkLocation | null;
  reason: string;
  status: AdjustmentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
}

export interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  desktime_employee_id: number | null;
  clock_in: string | null;
  clock_out: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: AttendanceStatus;
  late_minutes: number | null;
  early_departure_minutes: number | null;
  created_at: string;
  raw_response: Record<string, unknown> | null;
}

export interface AttendanceFlag {
  id: string;
  attendance_log_id: string | null;
  employee_id: string;
  flag_type: FlagType;
  flag_date: string;
  deviation_minutes: number;
  scheduled_time: string;
  actual_time: string | null;
  acknowledged: boolean;
  notes: string | null;
  created_at: string;
}

export interface SystemSetting {
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  type: NotificationType;
  recipient_email: string;
  subject: string;
  sent_at: string;
  related_id: string | null;
  status: "sent" | "failed";
}

export type LeaveDuration = "full_day" | "half_day";
export type HalfDayPeriod = "am" | "pm";

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  leave_duration: LeaveDuration;
  half_day_period: HalfDayPeriod | null;
  half_day_start_time: string | null;
  half_day_end_time: string | null;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
}

export interface Holiday {
  id: string;
  country: HolidayCountry;
  name: string;
  date: string;
  is_recurring: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HolidayWorkRequest {
  id: string;
  employee_id: string;
  holiday_id: string;
  holiday_date: string;
  start_time: string;
  end_time: string;
  work_location: WorkLocation;
  reason: string;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
}

// Extended types with joins
export interface UserWithManager extends User {
  manager?: User | null;
}

export interface ScheduleAdjustmentWithUser extends ScheduleAdjustment {
  employee?: User;
  reviewer?: User | null;
}

export interface AttendanceLogWithUser extends AttendanceLog {
  employee?: User;
}

export interface AttendanceFlagWithUser extends AttendanceFlag {
  employee?: User;
  attendance_log?: AttendanceLog | null;
}

export interface EmployeeLeaveType {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  activated_by: string | null;
  created_at: string;
}

export interface LeavePlan {
  id: string;
  name: string;
  description: string | null;
  renewal_month: number;
  renewal_day: number;
  created_at: string;
}

export interface LeavePlanAllocation {
  id: string;
  plan_id: string;
  leave_type: string;
  days_per_year: number;
}

export interface EmployeeLeavePlan {
  id: string;
  employee_id: string;
  plan_id: string;
  assigned_by: string | null;
  created_at: string;
}

// KPI types
export type KpiUnitType =
  | "percentage"
  | "currency"
  | "count"
  | "score"
  | "hours"
  | "custom";
export type KpiPeriodType = "monthly" | "quarterly" | "yearly";
export type KpiAssignmentStatus = "active" | "completed" | "archived";

export interface KpiDefinition {
  id: string;
  name: string;
  description: string | null;
  unit_type: KpiUnitType;
  unit_label: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KpiAssignment {
  id: string;
  kpi_definition_id: string;
  employee_id: string;
  assigned_by: string;
  period_type: KpiPeriodType;
  period_start: string;
  period_end: string;
  target_value: number;
  current_value: number;
  status: KpiAssignmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpiUpdate {
  id: string;
  kpi_assignment_id: string;
  updated_by: string;
  old_value: number;
  new_value: number;
  notes: string | null;
  created_at: string;
}

export interface KpiAssignmentWithDetails extends KpiAssignment {
  kpi_definition?: KpiDefinition;
  employee?: { id: string; full_name: string; email: string };
  assigned_by_user?: { id: string; full_name: string; email: string };
}

export interface KpiUpdateWithUser extends KpiUpdate {
  updated_by_user?: { id: string; full_name: string; email: string };
}
