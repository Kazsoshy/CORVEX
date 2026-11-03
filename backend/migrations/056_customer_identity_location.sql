-- ============================================================
-- CORVEX — Migration 056: Customer identity + nullable location
-- Supports canvassing registration with government ID fields
-- and optional map pins (no silent Davao defaults).
-- ============================================================

BEGIN;

ALTER TABLE customers
  ALTER COLUMN latitude DROP NOT NULL;

ALTER TABLE customers
  ALTER COLUMN longitude DROP NOT NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS id_type VARCHAR(80);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS id_number VARCHAR(80);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS id_photo TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS id_verification_status VARCHAR(30) NOT NULL DEFAULT 'Unverified';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'customers_id_verification_status_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_id_verification_status_check
      CHECK (id_verification_status IN ('Unverified', 'Pending Review', 'Verified'));
  END IF;
END $$;

COMMIT;
