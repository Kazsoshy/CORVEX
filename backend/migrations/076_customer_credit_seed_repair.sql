-- Repair only explicit seeded/synthetic customer fixtures.
-- Genuine user-created records and all transaction history are untouched.
BEGIN;

INSERT INTO customer_credit_info (
  customer_id, credit_limit, created_at, updated_at
)
SELECT
  c.customer_id,
  GREATEST(
    GREATEST(10000, LEAST(100000, CEIL(ca.outstanding_balance / 5000.0) * 5000)),
    ca.outstanding_balance
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM customers c
JOIN customer_activity ca ON ca.customer_id = c.customer_id
WHERE ca.outstanding_balance > 0
  AND (c.customer_code LIKE 'C-%' OR c.customer_code LIKE 'SYN-%')
  AND NOT EXISTS (
    SELECT 1 FROM customer_credit_info cci WHERE cci.customer_id = c.customer_id
  );

UPDATE customer_credit_info cci
SET credit_limit = GREATEST(
      GREATEST(10000, LEAST(100000, CEIL(ca.outstanding_balance / 5000.0) * 5000)),
      ca.outstanding_balance
    ),
    updated_at = CURRENT_TIMESTAMP
FROM customers c
JOIN customer_activity ca ON ca.customer_id = c.customer_id
WHERE cci.customer_id = c.customer_id
  AND ca.outstanding_balance > 0
  AND (c.customer_code LIKE 'C-%' OR c.customer_code LIKE 'SYN-%')
  AND cci.credit_limit < ca.outstanding_balance;

COMMIT;
