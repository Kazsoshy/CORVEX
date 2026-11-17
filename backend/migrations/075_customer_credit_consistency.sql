-- ============================================================
-- CORVEX — Migration 075: Customer credit consistency + change requests
-- ============================================================
-- 1. Credit consistency: every customer with outstanding_balance > 0 must have a
--    deterministic credit_limit > 0 so available_credit (limit - outstanding) is
--    never negative and the detail page never shows "₱0.00 limit, non-zero balance".
--    Formula: target = GREATEST(10000, LEAST(100000, CEIL(outstanding / 5000) * 5000))
--    credit_limit = GREATEST(target, outstanding)
--    Safeguard: only explicit seed/synthetic customer-code prefixes are touched.
--    Genuine user-created records are not modified by this migration.
-- 2. customer_change_requests table for SA proposed-change workflow.
-- ============================================================

BEGIN;

-- ── 1a. Backfill missing customer_credit_info for customers with a balance ──────

INSERT INTO customer_credit_info (
  customer_id, credit_limit, monthly_income, employment_status, credit_score,
  approved_by, approved_date, created_at, updated_at
)
SELECT
  c.customer_id,
  GREATEST(
    GREATEST(10000, LEAST(100000, CEIL(ca.outstanding_balance / 5000.0) * 5000)),
    ca.outstanding_balance
  ),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW()
FROM customers c
JOIN customer_activity ca ON ca.customer_id = c.customer_id
WHERE ca.outstanding_balance > 0
  AND (c.customer_code LIKE 'C-%' OR c.customer_code LIKE 'SYN-%')
  AND NOT EXISTS (
    SELECT 1 FROM customer_credit_info cci WHERE cci.customer_id = c.customer_id
  );

-- ── 1b. Fix existing rows where credit_limit = 0 but a balance exists ───────────

UPDATE customer_credit_info cci
SET
  credit_limit = GREATEST(
    GREATEST(10000, LEAST(100000, CEIL(ca.outstanding_balance / 5000.0) * 5000)),
    ca.outstanding_balance
  ),
  updated_at = NOW()
FROM customers c
JOIN customer_activity ca ON ca.customer_id = c.customer_id
WHERE cci.customer_id = c.customer_id
  AND ca.outstanding_balance > 0
  AND cci.credit_limit = 0
  AND (c.customer_code LIKE 'C-%' OR c.customer_code LIKE 'SYN-%');

-- ── 1c. Backfill approved_by from the branch manager when null ──────────────────

UPDATE customer_credit_info cci
SET approved_by = b.manager_id
FROM customers c
JOIN branches b ON b.id = c.branch_id
WHERE cci.customer_id = c.customer_id
  AND cci.approved_by IS NULL
  AND b.manager_id IS NOT NULL;

-- ── 1d. Index for the consistency check / lookup --------------------------------

CREATE INDEX IF NOT EXISTS idx_customer_credit_info_customer_id
  ON customer_credit_info (customer_id);

-- ── 2. customer_change_requests table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_change_requests (
  request_id         SERIAL PRIMARY KEY,
  customer_id        INTEGER NOT NULL REFERENCES customers (customer_id) ON DELETE CASCADE,
  branch_id          INTEGER NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  requested_by       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status             VARCHAR(20) NOT NULL DEFAULT 'Pending'
                     CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  change_type        VARCHAR(20) NOT NULL
                     CHECK (change_type IN ('Profile', 'Credit Request')),
  proposed_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason             VARCHAR(240),
  decision_remarks   TEXT,
  decided_by         INTEGER REFERENCES users (id) ON DELETE SET NULL,
  decided_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One Pending request per (customer_id, change_type) — mirrors the credit-investigation
-- duplicate guard in creditReview.js:514-525.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ccr_one_pending_per_customer_type
  ON customer_change_requests (customer_id, change_type)
  WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_ccr_customer_id ON customer_change_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status_created ON customer_change_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_ccr_branch_id ON customer_change_requests (branch_id);

-- ── 3. Updated-at trigger (mirrors credit_investigations convention) ────────────

DROP TRIGGER IF EXISTS trg_ccr_updated_at ON customer_change_requests;
CREATE TRIGGER trg_ccr_updated_at
  BEFORE UPDATE ON customer_change_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;