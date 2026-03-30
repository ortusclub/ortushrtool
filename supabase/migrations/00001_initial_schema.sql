-- Enums
CREATE TYPE user_role AS ENUM ('employee', 'manager', 'hr_admin', 'super_admin');
CREATE TYPE adjustment_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE attendance_status AS ENUM ('on_time', 'late_arrival', 'early_departure', 'late_and_early', 'absent', 'rest_day');
CREATE TYPE flag_type AS ENUM ('late_arrival', 'early_departure', 'absent');
CREATE TYPE notification_type AS ENUM ('schedule_adjustment_request', 'schedule_adjustment_decision', 'attendance_flag');
CREATE TYPE notification_status AS ENUM ('sent', 'failed');

-- Users table (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'employee',
  manager_id UUID REFERENCES public.users(id),
  department TEXT,
  desktime_employee_id INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_manager ON public.users(manager_id);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_desktime ON public.users(desktime_employee_id);

-- Schedules table
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_rest_day BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, day_of_week, effective_from)
);

CREATE INDEX idx_schedules_employee ON public.schedules(employee_id);

-- Schedule adjustments
CREATE TABLE public.schedule_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_date DATE NOT NULL,
  original_start_time TIME NOT NULL,
  original_end_time TIME NOT NULL,
  requested_start_time TIME NOT NULL,
  requested_end_time TIME NOT NULL,
  reason TEXT NOT NULL,
  status adjustment_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_adjustments_employee ON public.schedule_adjustments(employee_id);
CREATE INDEX idx_adjustments_status ON public.schedule_adjustments(status);
CREATE INDEX idx_adjustments_date ON public.schedule_adjustments(requested_date);

-- Attendance logs
CREATE TABLE public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  desktime_employee_id INTEGER,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  scheduled_start TIME NOT NULL,
  scheduled_end TIME NOT NULL,
  status attendance_status NOT NULL DEFAULT 'on_time',
  late_minutes INTEGER,
  early_departure_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_response JSONB,
  UNIQUE(employee_id, date)
);

CREATE INDEX idx_attendance_employee ON public.attendance_logs(employee_id);
CREATE INDEX idx_attendance_date ON public.attendance_logs(date);

-- Attendance flags
CREATE TABLE public.attendance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id UUID REFERENCES public.attendance_logs(id),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  flag_type flag_type NOT NULL,
  flag_date DATE NOT NULL,
  deviation_minutes INTEGER NOT NULL DEFAULT 0,
  scheduled_time TIME NOT NULL,
  actual_time TIME,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flags_employee ON public.attendance_flags(employee_id);
CREATE INDEX idx_flags_date ON public.attendance_flags(flag_date);
CREATE INDEX idx_flags_type ON public.attendance_flags(flag_type);

-- System settings
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default settings
INSERT INTO public.system_settings (key, value) VALUES
  ('late_tolerance_minutes', '15'),
  ('early_tolerance_minutes', '15');

-- Notification log
CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type notification_type NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  related_id UUID,
  status notification_status NOT NULL DEFAULT 'sent'
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Helper function for RLS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_manager_id()
RETURNS UUID AS $$
  SELECT manager_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
