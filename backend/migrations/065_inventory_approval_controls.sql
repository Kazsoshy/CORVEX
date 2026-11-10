-- Controlled stock posting: restock + stock-count approval, transfer ship/receive.

-- ── Restock headers: draft → pending → posted ────────────────────────────────
ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Posted';

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id);

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS decision_remarks TEXT;

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS posted_by INTEGER REFERENCES users(id);

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP;

ALTER TABLE restock_headers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE restock_headers
SET status = 'Posted',
    posted_at = COALESCE(posted_at, created_at),
    posted_by = COALESCE(posted_by, recorded_by)
WHERE status IS NULL OR status = 'Posted';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'restock_headers_status_check'
  ) THEN
    ALTER TABLE restock_headers
      ADD CONSTRAINT restock_headers_status_check
      CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Posted', 'Rejected'));
  END IF;
END
$do$;

CREATE INDEX IF NOT EXISTS idx_restock_headers_branch_status
  ON restock_headers (branch_id, status);

-- ── Stock count headers: variance approval ───────────────────────────────────
ALTER TABLE stock_count_headers
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);

ALTER TABLE stock_count_headers
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE stock_count_headers
  ADD COLUMN IF NOT EXISTS decision_remarks TEXT;

ALTER TABLE stock_count_headers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop old status check (Completed-only) and allow pending/rejected.
DO $do$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'stock_count_headers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE stock_count_headers DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE stock_count_headers
    ADD CONSTRAINT stock_count_headers_status_check
    CHECK (status IN ('Pending Approval', 'Completed', 'Rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

CREATE INDEX IF NOT EXISTS idx_stock_count_headers_branch_status
  ON stock_count_headers (branch_id, status);

-- ── Transfers: Shipped / Received (Received replaces Completed as finalize) ──
-- Keep Completed as alias of Received for historical rows.
DO $do$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'inventory_transfers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inventory_transfers DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE inventory_transfers
    ADD CONSTRAINT inventory_transfers_status_check
    CHECK (status IN (
      'Pending Approval', 'Submitted', 'Approved', 'Shipped', 'Received', 'Completed', 'Rejected'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS shipped_by INTEGER REFERENCES users(id);

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP;

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS received_by INTEGER REFERENCES users(id);

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS receive_notes TEXT;
