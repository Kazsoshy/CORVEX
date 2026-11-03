-- ============================================================
-- CORVEX — Migration 057: Structured customer address + primary contact relationship
-- ============================================================

BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address_region VARCHAR(100);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address_province VARCHAR(100);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address_city VARCHAR(100);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address_barangay VARCHAR(100);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address_street VARCHAR(150);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address_zip VARCHAR(20);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS contact_person_relationship VARCHAR(80);

COMMIT;
