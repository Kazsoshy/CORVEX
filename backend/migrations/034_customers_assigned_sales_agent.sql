-- Dedicated sales agent ownership per customer (portal purchase requests, sales queue).
BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS assigned_sales_agent_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_customers_assigned_sales_agent
  ON customers(assigned_sales_agent_id);

-- Existing customers: account manager when that user is sales staff
UPDATE customers c
SET assigned_sales_agent_id = c.account_manager_id
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE u.id = c.account_manager_id
  AND r.slug = 'sales_staff'
  AND c.assigned_sales_agent_id IS NULL;

-- Else most recent completed Sales visit by a sales agent
UPDATE customers c
SET assigned_sales_agent_id = sub.user_id
FROM (
  SELECT DISTINCT ON (fv.customer_id)
         fv.customer_id,
         fv.user_id
  FROM field_visits fv
  JOIN users u ON u.id = fv.user_id
  JOIN roles r ON r.role_id = u.role_id
  WHERE fv.status = 'Completed'
    AND fv.visit_type = 'Sales'
    AND r.slug = 'sales_staff'
  ORDER BY fv.customer_id, fv.scheduled_date DESC NULLS LAST, fv.visit_id DESC
) sub
WHERE c.customer_id = sub.customer_id
  AND c.assigned_sales_agent_id IS NULL;

-- Align open purchase requests with assigned agent
UPDATE purchase_requests pr
SET sales_agent_id = c.assigned_sales_agent_id,
    updated_at = CURRENT_TIMESTAMP
FROM customers c
WHERE c.customer_id = pr.customer_id
  AND c.assigned_sales_agent_id IS NOT NULL
  AND (pr.sales_agent_id IS DISTINCT FROM c.assigned_sales_agent_id);

COMMIT;
