-- KPI System: definitions, assignments, and audit trail

-- Enums
CREATE TYPE kpi_unit_type AS ENUM ('percentage', 'currency', 'count', 'score', 'hours', 'custom');
CREATE TYPE kpi_period_type AS ENUM ('monthly', 'quarterly', 'yearly');
CREATE TYPE kpi_assignment_status AS ENUM ('active', 'completed', 'archived');

-- KPI definitions (reusable templates)
CREATE TABLE public.kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit_type kpi_unit_type NOT NULL DEFAULT 'count',
  unit_label TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_definitions_created_by ON public.kpi_definitions(created_by);

CREATE TRIGGER update_kpi_definitions_updated_at
  BEFORE UPDATE ON public.kpi_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- KPI assignments (a KPI assigned to an employee for a period)
CREATE TABLE public.kpi_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_definition_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES public.users(id),
  period_type kpi_period_type NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0,
  status kpi_assignment_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kpi_definition_id, employee_id, period_start)
);

CREATE INDEX idx_kpi_assignments_employee ON public.kpi_assignments(employee_id);
CREATE INDEX idx_kpi_assignments_definition ON public.kpi_assignments(kpi_definition_id);
CREATE INDEX idx_kpi_assignments_period ON public.kpi_assignments(period_start, period_end);
CREATE INDEX idx_kpi_assignments_status ON public.kpi_assignments(status);

CREATE TRIGGER update_kpi_assignments_updated_at
  BEFORE UPDATE ON public.kpi_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- KPI updates (audit trail)
CREATE TABLE public.kpi_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_assignment_id UUID NOT NULL REFERENCES public.kpi_assignments(id) ON DELETE CASCADE,
  updated_by UUID NOT NULL REFERENCES public.users(id),
  old_value NUMERIC NOT NULL,
  new_value NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_updates_assignment ON public.kpi_updates(kpi_assignment_id);
CREATE INDEX idx_kpi_updates_updated_by ON public.kpi_updates(updated_by);

-- Recursive hierarchy helper (returns all direct + indirect report IDs)
CREATE OR REPLACE FUNCTION public.get_all_reports(manager_uuid UUID)
RETURNS SETOF UUID AS $$
  WITH RECURSIVE report_tree AS (
    SELECT id FROM public.users WHERE manager_id = manager_uuid AND is_active = true
    UNION ALL
    SELECT u.id FROM public.users u
    INNER JOIN report_tree rt ON u.manager_id = rt.id
    WHERE u.is_active = true
  )
  SELECT id FROM report_tree;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS
ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_updates ENABLE ROW LEVEL SECURITY;

-- kpi_definitions policies
CREATE POLICY kpi_def_read_manager ON public.kpi_definitions
  FOR SELECT USING (
    public.get_user_role() IN ('manager', 'hr_admin', 'super_admin')
  );

CREATE POLICY kpi_def_read_employee ON public.kpi_definitions
  FOR SELECT USING (
    id IN (SELECT kpi_definition_id FROM public.kpi_assignments WHERE employee_id = auth.uid())
  );

CREATE POLICY kpi_def_insert ON public.kpi_definitions
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('manager', 'hr_admin', 'super_admin')
  );

CREATE POLICY kpi_def_update ON public.kpi_definitions
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- kpi_assignments policies
CREATE POLICY kpi_assign_read_own ON public.kpi_assignments
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY kpi_assign_read_reports ON public.kpi_assignments
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
  );

CREATE POLICY kpi_assign_read_all ON public.kpi_assignments
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY kpi_assign_insert ON public.kpi_assignments
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('manager', 'hr_admin', 'super_admin')
  );

CREATE POLICY kpi_assign_update_own ON public.kpi_assignments
  FOR UPDATE USING (employee_id = auth.uid());

CREATE POLICY kpi_assign_update_manager ON public.kpi_assignments
  FOR UPDATE USING (
    employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
    OR public.get_user_role() IN ('hr_admin', 'super_admin')
  );

-- kpi_updates policies
CREATE POLICY kpi_updates_read_own ON public.kpi_updates
  FOR SELECT USING (
    kpi_assignment_id IN (SELECT id FROM public.kpi_assignments WHERE employee_id = auth.uid())
  );

CREATE POLICY kpi_updates_read_reports ON public.kpi_updates
  FOR SELECT USING (
    kpi_assignment_id IN (
      SELECT id FROM public.kpi_assignments
      WHERE employee_id IN (SELECT id FROM public.users WHERE manager_id = auth.uid())
    )
  );

CREATE POLICY kpi_updates_read_all ON public.kpi_updates
  FOR SELECT USING (
    public.get_user_role() IN ('hr_admin', 'super_admin')
  );

CREATE POLICY kpi_updates_insert ON public.kpi_updates
  FOR INSERT WITH CHECK (true);
