-- ============================================================
-- Ensure every existing customer has a customer_activity record
-- with valid purchase_volume, outstanding_balance, and last_sales_visit.
-- This migration is idempotent and does not depend on specific IDs.
-- ============================================================

BEGIN;

INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_collection_date, last_sales_visit, updated_at)
SELECT
  c.customer_id,
  10000.00 + (RANDOM() * 40000)::NUMERIC(10,2),
  30000.00 + (RANDOM() * 70000)::NUMERIC(10,2),
  CURRENT_DATE - (FLOOR(RANDOM() * 14) + 1) * INTERVAL '1 day',
  CURRENT_DATE - (FLOOR(RANDOM() * 7) + 1) * INTERVAL '1 day',
  NOW()
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM customer_activity ca WHERE ca.customer_id = c.customer_id
)
ON CONFLICT (customer_id) DO UPDATE SET
  outstanding_balance = EXCLUDED.outstanding_balance,
  purchase_volume = EXCLUDED.purchase_volume,
  last_collection_date = EXCLUDED.last_collection_date,
  last_sales_visit = EXCLUDED.last_sales_visit,
  updated_at = EXCLUDED.updated_at;

COMMIT;
