INSERT INTO system_settings (key, value)
VALUES
  ('birthday_emails_enabled', 'false'),
  ('anniversary_emails_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
