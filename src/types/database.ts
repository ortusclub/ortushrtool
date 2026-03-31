export type UserRole = "employee" | "manager" | "hr_admin" | "super_admin";
export type AdjustmentStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus =
  | "on_time"
  | "late_arrival"
  | "early_departure"
  | "late_and_early"
  | "absent"
  | "rest_day";
export type FlagType = "late_arrival" | "early_departure" | "absent";
export type WorkLocation = "office" | "online";
export type LeaveType = "annual" | "sick" | "personal" | "unpaid" | "other";
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

export interface ScheduleAdjustment {
  id: string;
  employee_id: string;
  requested_date: string;
  original_start_time: string;
  original_end_time: string;
  requested_start_time: string;
  requested_end_time: string;
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

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
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
