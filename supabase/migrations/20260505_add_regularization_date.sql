-- Track when an employee becomes regular (post-probation).
-- Null = still probationary (or unknown).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS regularization_date DATE;

-- If a customised birthday template exists, copy it to the new "regular"
-- type so HR's edits aren't lost when the template is split in two.
INSERT INTO public.email_templates (type, name, subject, body, variables, updated_by, updated_at)
SELECT
  'birthday_greeting_regular',
  'Birthday Greeting (Regular)',
  subject,
  body,
  variables,
  updated_by,
  now()
FROM public.email_templates
WHERE type = 'birthday_greeting'
ON CONFLICT (type) DO NOTHING;
