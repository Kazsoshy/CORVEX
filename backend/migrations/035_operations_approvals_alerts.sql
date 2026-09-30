-- Credit investigations, special collection approvals, operational alerts, OM notifications seed
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

CREATE TABLE IF NOT EXISTS credit_investigations (
  ci_id                 SERIAL PRIMARY KEY,
  customer_id           INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  branch_id             INTEGER NOT NULL REFERENCES branches(id),
  submitted_by          INTEGER NOT NULL REFERENCES users(id),
  approved_by           INTEGER REFERENCES users(id),
  status                VARCHAR(30) NOT NULL DEFAULT 'Pending'
                        CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Revision Requested')),
  purpose               VARCHAR(200),
  monthly_income        DECIMAL(12,2) DEFAULT 0,
  business_type         VARCHAR(100),
  references_summary    VARCHAR(200),
  form_remarks          TEXT,
  delinquency_status    VARCHAR(50) DEFAULT 'Clear',
  risk_score            INTEGER DEFAULT 0,
  leaflet_classification VARCHAR(50),
  rejection_reason      TEXT,
  payment_history_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  delinquency_flags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS special_collection_requests (
  request_id            SERIAL PRIMARY KEY,
  customer_id           INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  branch_id             INTEGER NOT NULL REFERENCES branches(id),
  request_type          VARCHAR(100) NOT NULL,
  amount                DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  requested_by          INTEGER NOT NULL REFERENCES users(id),
  approved_by           INTEGER REFERENCES users(id),
  status                VARCHAR(30) NOT NULL DEFAULT 'Pending'
                        CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operational_alerts (
  alert_id              SERIAL PRIMARY KEY,
  branch_id             INTEGER REFERENCES branches(id),
  alert_type            VARCHAR(100) NOT NULL,
  severity              VARCHAR(30) NOT NULL DEFAULT 'Warning'
                        CHECK (severity IN ('Critical', 'Warning', 'Informational')),
  title                 VARCHAR(200) NOT NULL,
  message               TEXT NOT NULL,
  status                VARCHAR(30) NOT NULL DEFAULT 'Open'
                        CHECK (status IN ('Open', 'Resolved')),
  assigned_to           INTEGER REFERENCES users(id),
  resolved_at           TIMESTAMP,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_investigations_branch ON credit_investigations(branch_id);
CREATE INDEX IF NOT EXISTS idx_credit_investigations_status ON credit_investigations(status);
CREATE INDEX IF NOT EXISTS idx_special_collection_branch ON special_collection_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_branch ON operational_alerts(branch_id);

-- Seed CIs from existing customers (idempotent)
INSERT INTO credit_investigations (
  customer_id, branch_id, submitted_by, status, purpose, monthly_income, business_type,
  references_summary, form_remarks, delinquency_status, risk_score, leaflet_classification,
  payment_history_json, delinquency_flags_json
)
SELECT
  c.customer_id,
  c.branch_id,
  COALESCE(
    (SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE r.slug = 'sales_staff' AND u.branch_id = c.branch_id AND u.status = 'Active' ORDER BY u.id LIMIT 1),
    (SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.slug = 'branch_manager' LIMIT 1)
  ),
  'Pending',
  'Credit limit increase',
  COALESCE(cci.monthly_income, 25000),
  'Retail furniture',
  'Verified',
  'Submitted from field sales visit.',
  CASE WHEN COALESCE(ca.outstanding_balance, 0) > 20000 THEN 'Review' ELSE 'Clear' END,
  CASE WHEN COALESCE(cci.credit_score, 700) >= 750 THEN 35 WHEN COALESCE(cci.credit_score, 700) >= 650 THEN 55 ELSE 72 END,
  'Moderate',
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('date', p.payment_date::text, 'amount', p.amount, 'status', 'Confirmed'))
     FROM (
       SELECT cp2.payment_date, cp2.amount
       FROM collection_payment cp2
       WHERE cp2.customer_id = c.customer_id
       ORDER BY cp2.payment_date DESC
       LIMIT 5
     ) p),
    '[]'::jsonb
  ),
  CASE WHEN COALESCE(ca.outstanding_balance, 0) > 25000 THEN '["High outstanding balance"]'::jsonb ELSE '[]'::jsonb END
FROM customers c
LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
WHERE c.last_name IN ('Lim', 'Mendoza', 'Imperial')
  AND NOT EXISTS (SELECT 1 FROM credit_investigations ci WHERE ci.customer_id = c.customer_id AND ci.status = 'Pending');

-- One approved CI sample
INSERT INTO credit_investigations (
  customer_id, branch_id, submitted_by, approved_by, status, purpose, monthly_income,
  business_type, references_summary, form_remarks, delinquency_status, risk_score, leaflet_classification
)
SELECT
  c.customer_id, c.branch_id,
  (SELECT u.id FROM users u WHERE u.email = 'jane.s@corvex.ph' LIMIT 1),
  (SELECT u.id FROM users u WHERE u.email = 'roberto.villanueva@corvex.ph' LIMIT 1),
  'Approved', 'New account credit line', 35000, 'Home furniture retail', 'Complete', 'Approved prior quarter', 'Clear', 28, 'Low'
FROM customers c
WHERE c.last_name = 'Yu'
  AND NOT EXISTS (SELECT 1 FROM credit_investigations ci WHERE ci.customer_id = c.customer_id AND ci.status = 'Approved')
LIMIT 1;

-- Special collection requests
INSERT INTO special_collection_requests (customer_id, branch_id, request_type, amount, notes, requested_by, status)
SELECT
  c.customer_id,
  c.branch_id,
  'Extended Payment Term',
  COALESCE(ca.outstanding_balance, 38000),
  'Customer requested extended terms due to seasonal slowdown.',
  (SELECT u.id FROM users u WHERE u.email = 'maria.dc@corvex.ph' LIMIT 1),
  'Pending'
FROM customers c
LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
WHERE c.last_name = 'Lim'
  AND NOT EXISTS (SELECT 1 FROM special_collection_requests s WHERE s.customer_id = c.customer_id AND s.status = 'Pending');

INSERT INTO special_collection_requests (customer_id, branch_id, request_type, amount, notes, requested_by, status)
SELECT
  c.customer_id,
  c.branch_id,
  'Partial Collection',
  10000,
  'Customer can settle partial amount this collection cycle.',
  (SELECT u.id FROM users u WHERE u.email = 'john.dc@corvex.ph' LIMIT 1),
  'Pending'
FROM customers c
WHERE c.last_name = 'Mendoza'
  AND NOT EXISTS (SELECT 1 FROM special_collection_requests s WHERE s.customer_id = c.customer_id AND s.request_type = 'Partial Collection');

-- Operational alerts
INSERT INTO operational_alerts (branch_id, alert_type, severity, title, message, status)
SELECT b.id, 'Delinquency Growth', 'Critical', 'Delinquency rate increase',
       'Delinquency rate elevated — review overdue accounts in this branch.', 'Open'
FROM branches b
WHERE b.name ILIKE '%Davao City%'
  AND NOT EXISTS (SELECT 1 FROM operational_alerts oa WHERE oa.branch_id = b.id AND oa.alert_type = 'Delinquency Growth');

INSERT INTO operational_alerts (branch_id, alert_type, severity, title, message, status)
SELECT b.id, 'Inventory Shortage', 'Warning', 'Low stock SKUs',
       'Multiple products below reorder point.', 'Open'
FROM branches b
WHERE b.name ILIKE '%Davao City%'
  AND NOT EXISTS (SELECT 1 FROM operational_alerts oa WHERE oa.branch_id = b.id AND oa.alert_type = 'Inventory Shortage');

INSERT INTO operational_alerts (branch_id, alert_type, severity, title, message, status, resolved_at)
SELECT b.id, 'Sales Completion Decline', 'Informational', 'Sales completion down',
       'Sales visit completion rate dipped vs last week.', 'Resolved', CURRENT_TIMESTAMP
FROM branches b
WHERE b.name ILIKE '%Davao City%'
  AND NOT EXISTS (SELECT 1 FROM operational_alerts oa WHERE oa.branch_id = b.id AND oa.alert_type = 'Sales Completion Decline');

-- OM phone + notifications
UPDATE users SET phone = '+63 918 555 4400' WHERE email = 'elena.mercado@corvex.ph' AND (phone IS NULL OR TRIM(phone) = '');

INSERT INTO notifications (user_id, title, message, status, category, created_at)
SELECT u.id, v.title, v.message, v.status, v.category, v.created_at
FROM users u
CROSS JOIN (
  VALUES
    ('Branch alert escalated', 'Davao City delinquency alert requires review.', 'Unread', 'Branch Alerts', NOW() - INTERVAL '3 hours'),
    ('Approval escalation', 'Inventory transfer pending executive review.', 'Unread', 'Approvals', NOW() - INTERVAL '5 hours'),
    ('KPI threshold', 'Davao City inventory health below target.', 'Read', 'KPI', NOW() - INTERVAL '1 day'),
    ('Report ready', 'Executive summary report is ready.', 'Unread', 'Reports', NOW() - INTERVAL '2 hours')
) AS v(title, message, status, category, created_at)
WHERE u.email = 'elena.mercado@corvex.ph'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.title = v.title
  );

COMMIT;
