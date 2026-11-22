-- Migration 083: Add 'Completed' status to restock workflow.
-- Warehouse staff can mark a Posted restock as Completed after verifying receipt.

-- Step 1: Drop the existing status constraint (if present) and recreate with Completed added.
DO $do$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'restock_headers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE restock_headers DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE restock_headers
    ADD CONSTRAINT restock_headers_status_check
    CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Posted', 'Rejected', 'Completed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

-- Step 2: Add completed_by and completed_at columns for warehouse verification tracking.
ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id);

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
