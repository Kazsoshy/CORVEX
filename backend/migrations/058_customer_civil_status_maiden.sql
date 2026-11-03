-- ============================================================
-- CORVEX — Migration 058: Customer civil status + mother's maiden name
-- ============================================================

BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS mothers_maiden_name VARCHAR(120);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS civil_status VARCHAR(30);

COMMIT;
