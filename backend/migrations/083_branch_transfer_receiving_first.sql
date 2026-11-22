-- CORVEX-DESTRUCTIVE-AUTHORIZED: rebuild open-transfer unique index + widen status CHECK (no table/data DROP)
-- 083_branch_transfer_receiving_first.sql
-- Purpose: SA provides current location; Receiving BM confirms territory; Source BM
--          releases ownership only; OM retains final approval. Extends
--          customer_branch_transfers (no second customer table).
-- Scope: Capstone customer cross-branch transfer revise (field portal / RBAC).
-- Safety: Additive columns + status CHECK widen. No DROP TABLE / TRUNCATE.
--         Open unique index rebuilt to include new open statuses.
--         Existing open "Pending Source" rows without location remain actionable
--         by Receiving BM (territory assign). "Needs Revision" → "Returned to SA".

ALTER TABLE customer_branch_transfers
  ADD COLUMN IF NOT EXISTS address_region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_province VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_barangay VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_street VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS proposed_territory_id INTEGER REFERENCES territories(territory_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receiving_bm_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_release_note TEXT;

-- Widen status CHECK (drop + recreate)
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'customer_branch_transfers'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE customer_branch_transfers DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE customer_branch_transfers
  ADD CONSTRAINT customer_branch_transfers_status_check
  CHECK (status IN (
    'Pending Receiving',
    'Pending Source',
    'Pending OM',
    'Returned to SA',
    'Needs Revision',
    'Approved',
    'Rejected',
    'Cancelled'
  ));

-- Map legacy OM-revision back to SA correction path
UPDATE customer_branch_transfers
SET status = 'Returned to SA',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'Needs Revision';

-- Legacy open Source-first rows without location: route to Receiving BM first
UPDATE customer_branch_transfers
SET status = 'Pending Receiving',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'Pending Source'
  AND target_territory_id IS NULL
  AND (address_barangay IS NULL OR BTRIM(address_barangay) = '');

DROP INDEX IF EXISTS uq_customer_branch_transfers_open;
CREATE UNIQUE INDEX uq_customer_branch_transfers_open
  ON customer_branch_transfers (customer_id)
  WHERE status IN (
    'Pending Receiving',
    'Pending Source',
    'Pending OM',
    'Returned to SA',
    'Needs Revision'
  );
