-- Captures how an approved holiday-work request will be compensated.
-- 'holiday_pay'  = monetary holiday premium (current behaviour for everyone).
-- 'cto'          = one earned CTO (Compensatory Time Off) day, auto-granted on
--                  approval. Only the holiday-work form will offer this option
--                  to PH employees with at least 1 year of tenure.
ALTER TABLE public.holiday_work_requests
  ADD COLUMN IF NOT EXISTS compensation TEXT NOT NULL DEFAULT 'holiday_pay'
  CHECK (compensation IN ('holiday_pay', 'cto'));
