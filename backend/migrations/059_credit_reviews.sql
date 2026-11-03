-- ============================================================
-- CORVEX — Migration 059: Credit Reviews (extends credit_investigations)
-- Preserves historical CI rows; adds review request + snapshot + decision fields.
-- ============================================================

BEGIN;

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS request_reason VARCHAR(120);

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS requested_credit_limit DECIMAL(12, 2);

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS request_remarks TEXT;

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS financial_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20);

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS risk_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS approved_credit_limit DECIMAL(12, 2);

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS decision_remarks TEXT;

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP;

-- Backfill request_reason from legacy purpose where missing
UPDATE credit_investigations
SET request_reason = purpose
WHERE request_reason IS NULL
  AND purpose IS NOT NULL
  AND TRIM(purpose) <> '';

-- Backfill risk_level from leaflet_classification / risk_score when possible
UPDATE credit_investigations
SET risk_level = CASE
  WHEN leaflet_classification ILIKE '%high%' OR risk_score >= 70 THEN 'High'
  WHEN leaflet_classification ILIKE '%low%' OR risk_score > 0 AND risk_score < 40 THEN 'Low'
  WHEN risk_score > 0 OR leaflet_classification IS NOT NULL THEN 'Medium'
  ELSE risk_level
END
WHERE risk_level IS NULL;

COMMIT;
