-- Holiday work requests table
CREATE TABLE public.holiday_work_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  holiday_id UUID NOT NULL REFERENCES public.holidays(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  work_location work_location NOT NULL,
  reason TEXT NOT NULL,
  status leave_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, holiday_date)
);

CREATE INDEX idx_holiday_work_employee ON public.holiday_work_requests(employee_id);
CREATE INDEX idx_holiday_work_status ON public.holiday_work_requests(status);
CREATE INDEX idx_holiday_work_date ON public.holiday_work_requests(holiday_date);

-- RLS
ALTER TABLE public.holiday_work_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY holiday_work_read_own ON public.holiday_work_requests
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY holiday_work_create_own ON public.holiday_work_requests
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY holiday_work_read_reports ON public.holiday_work_requests
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
  );

CREATE POLICY holiday_work_update_manager ON public.holiday_work_requests
  FOR UPDATE USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY holiday_work_read_all ON public.holiday_work_requests
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );
