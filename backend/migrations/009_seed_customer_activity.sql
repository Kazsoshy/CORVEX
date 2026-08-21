-- ============================================================
-- Seed: customer_activity and customer_credit_info
-- One row per existing customer (idempotent)
-- ============================================================

INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_collection_date, last_sales_visit, updated_at)
SELECT
  c.customer_id,
  12000.00,
  55000.00,
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE - INTERVAL '3 days',
  NOW()
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM customer_activity ca WHERE ca.customer_id = c.customer_id)
ON CONFLICT (customer_id) DO UPDATE SET
  outstanding_balance = EXCLUDED.outstanding_balance,
  purchase_volume = EXCLUDED.purchase_volume,
  last_collection_date = EXCLUDED.last_collection_date,
  last_sales_visit = EXCLUDED.last_sales_visit,
  updated_at = EXCLUDED.updated_at;

INSERT INTO customer_credit_info (customer_id, credit_limit, monthly_income, employment_status, credit_score, approved_by, approved_date, created_at, updated_at)
SELECT
  c.customer_id,
  50000.00,
  25000.00,
  'Employed',
  720,
  (SELECT id FROM users WHERE email = 'elena.mercado@corvex.ph'),
  CURRENT_DATE - INTERVAL '30 days',
  NOW(),
  NOW()
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM customer_credit_info cci WHERE cci.customer_id = c.customer_id)
ON CONFLICT (customer_id) DO NOTHING;
