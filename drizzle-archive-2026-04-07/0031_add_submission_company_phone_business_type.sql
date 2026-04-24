ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS company_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS company_business_type VARCHAR(255);
