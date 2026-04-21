-- Seed KPIs as a "coming soon" feature
INSERT INTO system_settings (key, value)
VALUES ('coming_soon:/kpis', 'true')
ON CONFLICT (key) DO NOTHING;
