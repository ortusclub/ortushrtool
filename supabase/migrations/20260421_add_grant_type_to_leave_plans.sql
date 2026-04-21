-- Add grant_type to leave_plans for flexible renewal timing
-- "custom" = fixed renewal_month/renewal_day (current default behavior)
-- "hire_date" = renews on employee's hire date each year, including first year
-- "anniversary" = renews on employee's hire date anniversary, 1st year onwards only
ALTER TABLE public.leave_plans
  ADD COLUMN IF NOT EXISTS grant_type TEXT NOT NULL DEFAULT 'custom';
