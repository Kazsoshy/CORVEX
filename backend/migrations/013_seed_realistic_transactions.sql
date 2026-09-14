-- ============================================================
-- CORVEX — Migration 013: Realistic Transaction Seed Data
-- Purpose: Populate collection_payment, sales_invoices,
--          sales_invoice_items, field_visits, field_activity_reports,
--          customer_activity, and performance_summary with real-looking
--          data anchored to CURRENT_DATE so the Executive Dashboard,
--          Branch Manager, and Reports pages always show live numbers.
--
-- All dates use CURRENT_DATE offsets — no hardcoded year/month.
-- Safe to re-run: uses ON CONFLICT / WHERE NOT EXISTS guards.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. RESOLVE IDs DYNAMICALLY
--    We use subqueries everywhere so this script works even if
--    IDs differ across environments.
-- ============================================================

-- Branch IDs
-- b1 = Davao City Branch
-- b2 = General Santos Branch
-- b3 = Davao Oriental Branch

-- Collector IDs (role slug = 'collector', active)
-- c1..c3 = Davao City collectors

-- Sales agent IDs (role slug = 'sales_staff', active)
-- s1 = Davao City, s2 = General Santos, s3 = Davao Oriental

-- ============================================================
-- 1. COLLECTION PAYMENTS
--    Source table for: TC = SUM(Ci)  [Equation 5]
--    Spans: current month + previous month (enables SGR / growth)
-- ============================================================

-- ── CURRENT MONTH (this month's collections, all 3 branches) ─────────────────

INSERT INTO collection_payment
  (receipt_number, customer_id, collector_id, branch_id, amount,
   payment_method_id, payment_date, payment_time, status, notes)
SELECT
  'RCP-CM-' || LPAD(seq::TEXT, 4, '0'),
  cust.customer_id,
  col.id,
  b.id,
  amt,
  1,
  (date_trunc('month', CURRENT_DATE) + ((seq - 1) % 20 * INTERVAL '1 day'))::DATE,
  (TIME '09:00:00' + ((seq % 8) * INTERVAL '1 hour')),
  CASE WHEN seq % 8 = 0 THEN 'Pending' ELSE 'Completed' END,
  note
FROM (VALUES
  -- Davao City — 12 receipts this month
  (1,  'Davao City Branch',    'Cash payment - monthly installment',      8500.00),
  (2,  'Davao City Branch',    'Full settlement of account',              15000.00),
  (3,  'Davao City Branch',    'Partial payment - remaining next visit',   6000.00),
  (4,  'Davao City Branch',    'Cash payment',                            12000.00),
  (5,  'Davao City Branch',    'Check payment - verified',                 9500.00),
  (6,  'Davao City Branch',    'GCash transfer confirmed',                 7200.00),
  (7,  'Davao City Branch',    'Cash payment - installment 3 of 6',        5500.00),
  (8,  'Davao City Branch',    'Full settlement',                         18000.00),
  (9,  'Davao City Branch',    'Bank transfer received',                  11000.00),
  (10, 'Davao City Branch',    'Cash - collector visit',                   4800.00),
  (11, 'Davao City Branch',    'Partial - will complete end of month',     7600.00),
  (12, 'Davao City Branch',    'Full payment on delivery',                13500.00),
  -- General Santos — 9 receipts
  (13, 'General Santos Branch','Cash payment received',                   16000.00),
  (14, 'General Santos Branch','Partial installment',                      9800.00),
  (15, 'General Santos Branch','Full settlement',                         22000.00),
  (16, 'General Santos Branch','GCash confirmed',                          8400.00),
  (17, 'General Santos Branch','Cash payment',                            14500.00),
  (18, 'General Santos Branch','Bank transfer',                           11200.00),
  (19, 'General Santos Branch','Cash - on site',                           7300.00),
  (20, 'General Santos Branch','Full payment',                            19000.00),
  (21, 'General Santos Branch','Installment payment 2',                    6600.00),
  -- Davao Oriental — 7 receipts
  (22, 'Davao Oriental Branch','Cash payment',                             5500.00),
  (23, 'Davao Oriental Branch','Full settlement',                         10000.00),
  (24, 'Davao Oriental Branch','Partial payment',                          4200.00),
  (25, 'Davao Oriental Branch','Check payment',                            8800.00),
  (26, 'Davao Oriental Branch','Cash - monthly installment',               6100.00),
  (27, 'Davao Oriental Branch','GCash payment',                            3900.00),
  (28, 'Davao Oriental Branch','Full payment received',                    7400.00)
) AS v(seq, branch_name, note, amt)
JOIN branches b ON b.name = v.branch_name
-- pick any active collector from that branch
JOIN LATERAL (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'collector' AND u.status = 'Active' AND u.branch_id = b.id
  ORDER BY u.id LIMIT 1
) col ON TRUE
-- pick the first customer from that branch
JOIN LATERAL (
  SELECT c.customer_id FROM customers c
  WHERE c.branch_id = b.id AND c.status = 'Active'
  ORDER BY c.customer_id
  OFFSET (v.seq % 3) LIMIT 1
) cust ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM collection_payment cp
  WHERE cp.receipt_number = 'RCP-CM-' || LPAD(v.seq::TEXT, 4, '0')
);

-- ── PREVIOUS MONTH (enables collection growth rate calculation) ───────────────

INSERT INTO collection_payment
  (receipt_number, customer_id, collector_id, branch_id, amount,
   payment_method_id, payment_date, payment_time, status, notes)
SELECT
  'RCP-PM-' || LPAD(seq::TEXT, 4, '0'),
  cust.customer_id,
  col.id,
  b.id,
  amt,
  1,
  (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' + ((seq - 1) % 20 * INTERVAL '1 day'))::DATE,
  TIME '10:00:00',
  'Completed',
  note
FROM (VALUES
  (1,  'Davao City Branch',    'Previous month collection',    7800.00),
  (2,  'Davao City Branch',    'Previous month installment',  13500.00),
  (3,  'Davao City Branch',    'Prev month full payment',      5200.00),
  (4,  'Davao City Branch',    'Prev month cash',             10800.00),
  (5,  'Davao City Branch',    'Prev month check',             8900.00),
  (6,  'Davao City Branch',    'Prev month GCash',             6400.00),
  (7,  'Davao City Branch',    'Prev month installment',       4900.00),
  (8,  'Davao City Branch',    'Prev month full settlement',  16200.00),
  (9,  'Davao City Branch',    'Prev month bank transfer',     9700.00),
  (10, 'Davao City Branch',    'Prev month cash',              4100.00),
  (11, 'General Santos Branch','Prev month payment',          14800.00),
  (12, 'General Santos Branch','Prev month installment',       8600.00),
  (13, 'General Santos Branch','Prev month full settlement',  20000.00),
  (14, 'General Santos Branch','Prev month GCash',             7200.00),
  (15, 'General Santos Branch','Prev month cash',             12500.00),
  (16, 'Davao Oriental Branch','Prev month cash',              4800.00),
  (17, 'Davao Oriental Branch','Prev month full settlement',   8500.00),
  (18, 'Davao Oriental Branch','Prev month partial',           3600.00),
  (19, 'Davao Oriental Branch','Prev month check',             7200.00)
) AS v(seq, branch_name, note, amt)
JOIN branches b ON b.name = v.branch_name
JOIN LATERAL (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'collector' AND u.status = 'Active' AND u.branch_id = b.id
  ORDER BY u.id LIMIT 1
) col ON TRUE
JOIN LATERAL (
  SELECT c.customer_id FROM customers c
  WHERE c.branch_id = b.id AND c.status = 'Active'
  ORDER BY c.customer_id
  OFFSET (v.seq % 3) LIMIT 1
) cust ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM collection_payment cp
  WHERE cp.receipt_number = 'RCP-PM-' || LPAD(v.seq::TEXT, 4, '0')
);

-- ── LAST 7 DAYS (for collection trend chart) ─────────────────────────────────

INSERT INTO collection_payment
  (receipt_number, customer_id, collector_id, branch_id, amount,
   payment_method_id, payment_date, payment_time, status, notes)
SELECT
  'RCP-7D-' || LPAD(seq::TEXT, 4, '0'),
  cust.customer_id,
  col.id,
  b.id,
  amt,
  1,
  CURRENT_DATE - days_ago * INTERVAL '1 day',
  TIME '11:00:00',
  'Completed',
  'Daily collection'
FROM (VALUES
  -- Mon-Sun last 7 days, spread across branches
  (1, 'Davao City Branch',    6, 12500.00),
  (2, 'Davao City Branch',    5, 18000.00),
  (3, 'Davao City Branch',    4,  9800.00),
  (4, 'Davao City Branch',    3, 21000.00),
  (5, 'Davao City Branch',    2, 15500.00),
  (6, 'Davao City Branch',    1, 17200.00),
  (7, 'Davao City Branch',    0, 11400.00),
  (8, 'General Santos Branch', 6, 19000.00),
  (9, 'General Santos Branch', 5, 24500.00),
  (10,'General Santos Branch', 4, 13200.00),
  (11,'General Santos Branch', 3, 28000.00),
  (12,'General Santos Branch', 2, 20000.00),
  (13,'General Santos Branch', 1, 22800.00),
  (14,'General Santos Branch', 0, 16600.00),
  (15,'Davao Oriental Branch', 6,  7800.00),
  (16,'Davao Oriental Branch', 5, 10500.00),
  (17,'Davao Oriental Branch', 4,  6100.00),
  (18,'Davao Oriental Branch', 3, 12200.00),
  (19,'Davao Oriental Branch', 2,  8900.00),
  (20,'Davao Oriental Branch', 1,  9400.00),
  (21,'Davao Oriental Branch', 0,  7100.00)
) AS v(seq, branch_name, days_ago, amt)
JOIN branches b ON b.name = v.branch_name
JOIN LATERAL (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'collector' AND u.status = 'Active' AND u.branch_id = b.id
  ORDER BY u.id LIMIT 1
) col ON TRUE
JOIN LATERAL (
  SELECT c.customer_id FROM customers c
  WHERE c.branch_id = b.id AND c.status = 'Active'
  ORDER BY c.customer_id LIMIT 1
) cust ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM collection_payment cp
  WHERE cp.receipt_number = 'RCP-7D-' || LPAD(v.seq::TEXT, 4, '0')
);

-- ============================================================
-- 2. SALES INVOICES
--    Source table for: TS = SUM(Si)  [Equation 6]
--    Spans: current month + previous month (enables SGR)
-- ============================================================

-- ── CURRENT MONTH SALES ───────────────────────────────────────────────────────

INSERT INTO sales_invoices
  (invoice_number, customer_id, sales_agent_id, branch_id, total_amount,
   payment_method_id, status, invoices_date, notes)
SELECT
  'INV-CM-' || LPAD(seq::TEXT, 4, '0'),
  cust.customer_id,
  agent.id,
  b.id,
  amt,
  1,
  CASE WHEN seq % 7 = 0 THEN 'Pending Review' WHEN seq % 11 = 0 THEN 'Draft' ELSE 'Confirmed' END,
  (date_trunc('month', CURRENT_DATE) + ((seq - 1) % 22 * INTERVAL '1 day'))::DATE,
  product_note
FROM (VALUES
  -- Davao City (10 invoices)
  (1,  'Davao City Branch',    'Sofa Set 3-Seater — cash sale',           24999.00),
  (2,  'Davao City Branch',    'Coffee Table — installment',               8999.00),
  (3,  'Davao City Branch',    'Queen Bed Frame — bank transfer',         18999.00),
  (4,  'Davao City Branch',    'Dining Table 6-Seater',                   32999.00),
  (5,  'Davao City Branch',    'Office Chair x2',                         11998.00),
  (6,  'Davao City Branch',    'Mattress Queen — full payment',           12999.00),
  (7,  'Davao City Branch',    'Garden Bench set',                         7999.00),
  (8,  'Davao City Branch',    'Sofa Set — GCash',                        24999.00),
  (9,  'Davao City Branch',    'Coffee Table + Office Chair bundle',      14998.00),
  (10, 'Davao City Branch',    'Queen Bed Frame — installment approved',  18999.00),
  -- General Santos (8 invoices)
  (11, 'General Santos Branch','Dining Table 6-Seater — confirmed',       32999.00),
  (12, 'General Santos Branch','Sofa Set — cash',                         24999.00),
  (13, 'General Santos Branch','Office Chair x3',                         17997.00),
  (14, 'General Santos Branch','Mattress Queen + base',                   19998.00),
  (15, 'General Santos Branch','Coffee Table — cash',                      8999.00),
  (16, 'General Santos Branch','Garden Bench — confirmed',                 7999.00),
  (17, 'General Santos Branch','Queen Bed Frame',                         18999.00),
  (18, 'General Santos Branch','Dining Table + chairs',                   38999.00),
  -- Davao Oriental (6 invoices)
  (19, 'Davao Oriental Branch','Mattress Queen — cash',                   12999.00),
  (20, 'Davao Oriental Branch','Garden Bench',                             7999.00),
  (21, 'Davao Oriental Branch','Office Chair — installment',               5999.00),
  (22, 'Davao Oriental Branch','Sofa Set 3-Seater',                       24999.00),
  (23, 'Davao Oriental Branch','Coffee Table',                             8999.00),
  (24, 'Davao Oriental Branch','Queen Bed Frame — bank transfer',         18999.00)
) AS v(seq, branch_name, product_note, amt)
JOIN branches b ON b.name = v.branch_name
JOIN LATERAL (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'sales_staff' AND u.status = 'Active' AND u.branch_id = b.id
  ORDER BY u.id LIMIT 1
) agent ON TRUE
JOIN LATERAL (
  SELECT c.customer_id FROM customers c
  WHERE c.branch_id = b.id AND c.status = 'Active'
  ORDER BY c.customer_id
  OFFSET (v.seq % 3) LIMIT 1
) cust ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM sales_invoices si
  WHERE si.invoice_number = 'INV-CM-' || LPAD(v.seq::TEXT, 4, '0')
);

-- ── CURRENT MONTH INVOICE ITEMS ───────────────────────────────────────────────

INSERT INTO sales_invoice_items (invoices_id, product_id, quantity, unit_price, line_total)
SELECT
  si.sales_invoices_id,
  p.id,
  1,
  si.total_amount,
  si.total_amount
FROM sales_invoices si
JOIN products p ON p.id = (
  SELECT id FROM products ORDER BY id
  OFFSET (si.sales_invoices_id % 7) LIMIT 1
)
WHERE si.invoice_number LIKE 'INV-CM-%'
  AND NOT EXISTS (
    SELECT 1 FROM sales_invoice_items sii WHERE sii.invoices_id = si.sales_invoices_id
  );

-- ── PREVIOUS MONTH SALES (for Sales Growth Rate — Equation 7) ────────────────

INSERT INTO sales_invoices
  (invoice_number, customer_id, sales_agent_id, branch_id, total_amount,
   payment_method_id, status, invoices_date, notes)
SELECT
  'INV-PM-' || LPAD(seq::TEXT, 4, '0'),
  cust.customer_id,
  agent.id,
  b.id,
  amt,
  1,
  'Confirmed',
  (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' + ((seq - 1) % 22 * INTERVAL '1 day'))::DATE,
  'Previous month sale'
FROM (VALUES
  -- Previous month was lower (so SGR shows growth)
  (1,  'Davao City Branch',    20000.00),
  (2,  'Davao City Branch',    14000.00),
  (3,  'Davao City Branch',    18000.00),
  (4,  'Davao City Branch',    28000.00),
  (5,  'Davao City Branch',    10000.00),
  (6,  'Davao City Branch',    11000.00),
  (7,  'Davao City Branch',    22000.00),
  (8,  'General Santos Branch',28000.00),
  (9,  'General Santos Branch',22000.00),
  (10, 'General Santos Branch',16000.00),
  (11, 'General Santos Branch',17000.00),
  (12, 'General Santos Branch', 7000.00),
  (13, 'General Santos Branch',15000.00),
  (14, 'Davao Oriental Branch', 9000.00),
  (15, 'Davao Oriental Branch', 6000.00),
  (16, 'Davao Oriental Branch', 4500.00),
  (17, 'Davao Oriental Branch',20000.00)
) AS v(seq, branch_name, amt)
JOIN branches b ON b.name = v.branch_name
JOIN LATERAL (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'sales_staff' AND u.status = 'Active' AND u.branch_id = b.id
  ORDER BY u.id LIMIT 1
) agent ON TRUE
JOIN LATERAL (
  SELECT c.customer_id FROM customers c
  WHERE c.branch_id = b.id AND c.status = 'Active'
  ORDER BY c.customer_id LIMIT 1
) cust ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM sales_invoices si
  WHERE si.invoice_number = 'INV-PM-' || LPAD(v.seq::TEXT, 4, '0')
);

-- Invoice items for previous month
INSERT INTO sales_invoice_items (invoices_id, product_id, quantity, unit_price, line_total)
SELECT
  si.sales_invoices_id,
  p.id,
  1,
  si.total_amount,
  si.total_amount
FROM sales_invoices si
JOIN products p ON p.id = (
  SELECT id FROM products ORDER BY id
  OFFSET (si.sales_invoices_id % 7) LIMIT 1
)
WHERE si.invoice_number LIKE 'INV-PM-%'
  AND NOT EXISTS (
    SELECT 1 FROM sales_invoice_items sii WHERE sii.invoices_id = si.sales_invoices_id
  );

-- ── LAST 7 DAYS SALES (for sales trend chart) ────────────────────────────────

INSERT INTO sales_invoices
  (invoice_number, customer_id, sales_agent_id, branch_id, total_amount,
   payment_method_id, status, invoices_date, notes)
SELECT
  'INV-7D-' || LPAD(seq::TEXT, 4, '0'),
  cust.customer_id,
  agent.id,
  b.id,
  amt,
  1,
  'Confirmed',
  CURRENT_DATE - days_ago * INTERVAL '1 day',
  'Daily sales'
FROM (VALUES
  (1,  'Davao City Branch',    6, 23500.00),
  (2,  'Davao City Branch',    5, 31000.00),
  (3,  'Davao City Branch',    4, 18800.00),
  (4,  'Davao City Branch',    3, 42000.00),
  (5,  'Davao City Branch',    2, 27500.00),
  (6,  'Davao City Branch',    1, 35200.00),
  (7,  'Davao City Branch',    0, 19400.00),
  (8,  'General Santos Branch', 6, 38000.00),
  (9,  'General Santos Branch', 5, 45500.00),
  (10, 'General Santos Branch', 4, 29200.00),
  (11, 'General Santos Branch', 3, 52000.00),
  (12, 'General Santos Branch', 2, 34000.00),
  (13, 'General Santos Branch', 1, 41800.00),
  (14, 'General Santos Branch', 0, 26600.00),
  (15, 'Davao Oriental Branch', 6, 14800.00),
  (16, 'Davao Oriental Branch', 5, 18500.00),
  (17, 'Davao Oriental Branch', 4, 11100.00),
  (18, 'Davao Oriental Branch', 3, 22200.00),
  (19, 'Davao Oriental Branch', 2, 15900.00),
  (20, 'Davao Oriental Branch', 1, 17400.00),
  (21, 'Davao Oriental Branch', 0, 12100.00)
) AS v(seq, branch_name, days_ago, amt)
JOIN branches b ON b.name = v.branch_name
JOIN LATERAL (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'sales_staff' AND u.status = 'Active' AND u.branch_id = b.id
  ORDER BY u.id LIMIT 1
) agent ON TRUE
JOIN LATERAL (
  SELECT c.customer_id FROM customers c
  WHERE c.branch_id = b.id AND c.status = 'Active'
  ORDER BY c.customer_id LIMIT 1
) cust ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM sales_invoices si
  WHERE si.invoice_number = 'INV-7D-' || LPAD(v.seq::TEXT, 4, '0')
);

INSERT INTO sales_invoice_items (invoices_id, product_id, quantity, unit_price, line_total)
SELECT
  si.sales_invoices_id,
  p.id,
  1,
  si.total_amount,
  si.total_amount
FROM sales_invoices si
JOIN products p ON p.id = (
  SELECT id FROM products ORDER BY id
  OFFSET (si.sales_invoices_id % 7) LIMIT 1
)
WHERE si.invoice_number LIKE 'INV-7D-%'
  AND NOT EXISTS (
    SELECT 1 FROM sales_invoice_items sii WHERE sii.invoices_id = si.sales_invoices_id
  );

-- ============================================================
-- 3. FIELD VISITS
--    Source: routeCompliance = Completed/Total × 100
--    Source: salesVisitCompletion = Sales Completed/Total × 100
-- ============================================================

INSERT INTO field_visits (customer_id, user_id, visit_type, scheduled_date, status)
SELECT
  cust.customer_id,
  u.id,
  v_type,
  CURRENT_DATE - days_ago * INTERVAL '1 day',
  v_status
FROM (VALUES
  -- Davao City collectors — 4 weeks of visits
  ('Davao City Branch', 'collector',   'Collection', 28, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 27, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 26, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 25, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 24, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 21, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 20, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 19, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 18, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 14, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 13, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection', 12, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection',  7, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection',  6, 'Pending'),
  ('Davao City Branch', 'collector',   'Collection',  5, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection',  4, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection',  3, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection',  2, 'Completed'),
  ('Davao City Branch', 'collector',   'Collection',  1, 'Pending'),
  ('Davao City Branch', 'collector',   'Collection',  0, 'Pending'),
  -- Davao City sales visits
  ('Davao City Branch', 'sales_staff', 'Sales',      27, 'Completed'),
  ('Davao City Branch', 'sales_staff', 'Sales',      26, 'Completed'),
  ('Davao City Branch', 'sales_staff', 'Sales',      25, 'Completed'),
  ('Davao City Branch', 'sales_staff', 'Sales',      20, 'Completed'),
  ('Davao City Branch', 'sales_staff', 'Sales',      19, 'Completed'),
  ('Davao City Branch', 'sales_staff', 'Sales',      13, 'Completed'),
  ('Davao City Branch', 'sales_staff', 'Sales',       6, 'Completed'),
  ('Davao City Branch', 'sales_staff', 'Sales',       5, 'Pending'),
  ('Davao City Branch', 'sales_staff', 'Sales',       1, 'Completed'),
  -- General Santos
  ('General Santos Branch', 'sales_staff', 'Sales',  27, 'Completed'),
  ('General Santos Branch', 'sales_staff', 'Sales',  26, 'Completed'),
  ('General Santos Branch', 'sales_staff', 'Sales',  20, 'Completed'),
  ('General Santos Branch', 'sales_staff', 'Sales',  19, 'Completed'),
  ('General Santos Branch', 'sales_staff', 'Sales',  13, 'Completed'),
  ('General Santos Branch', 'sales_staff', 'Sales',   6, 'Completed'),
  ('General Santos Branch', 'sales_staff', 'Sales',   5, 'Pending'),
  ('General Santos Branch', 'sales_staff', 'Sales',   1, 'Pending'),
  -- Davao Oriental
  ('Davao Oriental Branch', 'sales_staff', 'Sales',  27, 'Completed'),
  ('Davao Oriental Branch', 'sales_staff', 'Sales',  20, 'Completed'),
  ('Davao Oriental Branch', 'sales_staff', 'Sales',  13, 'Completed'),
  ('Davao Oriental Branch', 'sales_staff', 'Sales',   6, 'Completed'),
  ('Davao Oriental Branch', 'sales_staff', 'Sales',   1, 'Pending')
) AS v(branch_name, role_slug, v_type, days_ago, v_status)
JOIN branches b ON b.name = v.branch_name
JOIN LATERAL (
  SELECT u2.id FROM users u2
  JOIN roles r2 ON r2.role_id = u2.role_id
  WHERE r2.slug = v.role_slug AND u2.status = 'Active' AND u2.branch_id = b.id
  ORDER BY u2.id LIMIT 1
) u ON TRUE
JOIN LATERAL (
  SELECT c.customer_id FROM customers c
  WHERE c.branch_id = b.id AND c.status = 'Active'
  ORDER BY c.customer_id LIMIT 1
) cust ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM field_visits fv
  WHERE fv.user_id = u.id
    AND fv.customer_id = cust.customer_id
    AND fv.visit_type = v.v_type
    AND fv.scheduled_date = CURRENT_DATE - v.days_ago * INTERVAL '1 day'
);

-- ============================================================
-- 4. CUSTOMER ACTIVITY — update outstanding balances
--    Source for: TOB = SUM(OBi)  [Equation 9]
--    Assigns realistic varied balances per customer
-- ============================================================

UPDATE customer_activity SET
  outstanding_balance = CASE
    WHEN customer_id % 5 = 0 THEN 0.00          -- paid up
    WHEN customer_id % 5 = 1 THEN 18500.00       -- moderate balance
    WHEN customer_id % 5 = 2 THEN 32000.00       -- higher balance
    WHEN customer_id % 5 = 3 THEN  8200.00       -- low balance
    ELSE                           24750.00       -- typical
  END,
  purchase_volume = CASE
    WHEN customer_id % 3 = 0 THEN 85000.00
    WHEN customer_id % 3 = 1 THEN 120000.00
    ELSE                          65000.00
  END,
  last_collection_date = CURRENT_DATE - (customer_id % 14 + 1) * INTERVAL '1 day',
  last_sales_visit     = CURRENT_DATE - (customer_id % 7  + 1) * INTERVAL '1 day',
  updated_at           = NOW();

-- ============================================================
-- 5. PERFORMANCE SUMMARY — current month history
--    Feeds the Branch Manager analytics and KPI scores
-- ============================================================

INSERT INTO performance_summary (branch_id, total_sales, total_collections, inventory_accuracy, generated_at)
SELECT
  b.id,
  total_s,
  total_c,
  inv_acc,
  (date_trunc('month', CURRENT_DATE) + (day_offset * INTERVAL '1 day'))::TIMESTAMP
FROM (VALUES
  ('Davao City Branch',    0,  162990.00, 84000.00, 94.50),
  ('Davao City Branch',    3,  175200.00, 92000.00, 95.00),
  ('Davao City Branch',    7,  158500.00, 78000.00, 94.00),
  ('Davao City Branch',   10,  183000.00, 96000.00, 95.50),
  ('Davao City Branch',   14,  171000.00, 88000.00, 94.50),
  ('Davao City Branch',   17,  168000.00, 91000.00, 95.00),
  ('Davao City Branch',   21,  177000.00, 94000.00, 95.00),
  ('General Santos Branch', 0, 198000.00, 112000.00, 91.20),
  ('General Santos Branch', 3, 214000.00, 125000.00, 91.50),
  ('General Santos Branch', 7, 202000.00, 118000.00, 91.00),
  ('General Santos Branch',10, 221000.00, 131000.00, 92.00),
  ('General Santos Branch',14, 196000.00, 109000.00, 91.20),
  ('General Santos Branch',17, 208000.00, 122000.00, 91.50),
  ('General Santos Branch',21, 216000.00, 127000.00, 91.80),
  ('Davao Oriental Branch', 0,  82000.00,  38000.00, 88.75),
  ('Davao Oriental Branch', 3,  89000.00,  43000.00, 89.00),
  ('Davao Oriental Branch', 7,  78000.00,  36000.00, 88.50),
  ('Davao Oriental Branch',10,  95000.00,  46000.00, 89.50),
  ('Davao Oriental Branch',14,  85000.00,  40000.00, 88.75),
  ('Davao Oriental Branch',17,  91000.00,  44000.00, 89.00),
  ('Davao Oriental Branch',21,  88000.00,  42000.00, 89.00)
) AS v(branch_name, day_offset, total_s, total_c, inv_acc)
JOIN branches b ON b.name = v.branch_name
WHERE NOT EXISTS (
  SELECT 1 FROM performance_summary ps
  WHERE ps.branch_id = b.id
    AND ps.generated_at = (date_trunc('month', CURRENT_DATE) + (v.day_offset * INTERVAL '1 day'))::TIMESTAMP
);

-- ============================================================
-- 6. AUDIT LOGS — recent login activity (for audit log display)
-- ============================================================

INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details, created_at)
SELECT
  u.id,
  u.first_name || ' ' || u.last_name,
  action_text,
  ip_addr,
  details,
  NOW() - (offset_hours * INTERVAL '1 hour')
FROM (VALUES
  ('roberto.villanueva@corvex.ph', 'Login',          '192.168.1.10', 'Successful login',       2),
  ('miguel.f@corvex.ph',           'Login',          '192.168.2.14', 'Successful login',       3),
  ('grace.t@corvex.ph',            'Login',          '192.168.3.22', 'Successful login',       4),
  ('elena.mercado@corvex.ph',      'Login',          '192.168.1.2',  'Successful login',       1),
  ('corazon.v@corvex.ph',          'Login',          '192.168.1.1',  'Successful login',       6),
  ('maria.dc@corvex.ph',           'Login',          '192.168.1.11', 'Successful login',       5),
  ('jane.s@corvex.ph',             'Login',          '192.168.1.12', 'Successful login',       7),
  ('roberto.villanueva@corvex.ph', 'View Dashboard', '192.168.1.10', 'Accessed branch dashboard', 2),
  ('elena.mercado@corvex.ph',      'View Dashboard', '192.168.1.2',  'Accessed executive dashboard', 1),
  ('miguel.f@corvex.ph',           'View Customers', '192.168.2.14', 'Accessed customer list',  3)
) AS v(email, action_text, ip_addr, details, offset_hours)
JOIN users u ON u.email = v.email
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs al
  WHERE al.user_id = u.id
    AND al.action = v.action_text
    AND al.created_at > NOW() - INTERVAL '1 day'
);

COMMIT;
