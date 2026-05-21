-- Distinguish employees from consultants. Drives perks such as the CTO-vs-pay
-- choice on PH holiday-work requests. Defaults to 'employee' so existing rows
-- keep their current capabilities.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'employee'
  CHECK (employment_type IN ('employee', 'consultant'));
