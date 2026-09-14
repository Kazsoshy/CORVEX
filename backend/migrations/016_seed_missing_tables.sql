-- ============================================================
-- CORVEX — Migration 016: Seed missing tables & fill missing FK fields
-- Populates: inventory_transfers, restocks, and sets account_manager_id
-- on customers, updates branches with complete info.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1. Update branches with phone, region, email, manager_id
-- ════════════════════════════════════════════════════════════
UPDATE branches b
SET
  region     = CASE b.name
                 WHEN 'Davao City Branch'    THEN 'Region XI – Davao Region'
                 WHEN 'General Santos Branch' THEN 'Region XII – SOCCSKSARGEN'
                 WHEN 'Davao Oriental Branch' THEN 'Region XI – Davao Region'
                 ELSE 'Region XI – Davao Region'
               END,
  email      = CASE b.name
                 WHEN 'Davao City Branch'    THEN 'davao@corvex.ph'
                 WHEN 'General Santos Branch' THEN 'gensan@corvex.ph'
                 WHEN 'Davao Oriental Branch' THEN 'davoriental@corvex.ph'
                 ELSE b.email
               END,
  phone      = CASE b.name
                 WHEN 'Davao City Branch'    THEN '(082) 221-4488'
                 WHEN 'General Santos Branch' THEN '(083) 552-8800'
                 WHEN 'Davao Oriental Branch' THEN '(087) 388-1122'
                 ELSE b.phone
               END,
  manager_id = (
    SELECT u.id FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE r.slug = 'branch_manager' AND u.branch_id = b.id
    ORDER BY u.id LIMIT 1
  )
WHERE b.status = 'Active';

-- ════════════════════════════════════════════════════════════
-- 2. Set account_manager_id on customers
--    Each customer is assigned the branch manager of their branch
-- ════════════════════════════════════════════════════════════
UPDATE customers c
SET account_manager_id = (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'branch_manager' AND u.branch_id = c.branch_id
  ORDER BY u.id LIMIT 1
)
WHERE account_manager_id IS NULL;

-- ════════════════════════════════════════════════════════════
-- 3. Seed restocks (was restock_records)
-- ════════════════════════════════════════════════════════════
INSERT INTO restocks (product_id, branch_id, delivery_ref, supplier_id, quantity, received_date)
SELECT
  p.id,
  b.id,
  'DEL-' || LPAD(ROW_NUMBER() OVER ()::TEXT, 4, '0'),
  (SELECT suppliers_id FROM suppliers ORDER BY suppliers_id LIMIT 1),
  (CASE WHEN p.id % 3 = 0 THEN 8 WHEN p.id % 3 = 1 THEN 12 ELSE 15 END),
  CURRENT_DATE - (p.id % 14 + 1) * INTERVAL '1 day'
FROM products p
CROSS JOIN branches b
WHERE b.status = 'Active'
  AND NOT EXISTS (
    SELECT 1 FROM restocks r WHERE r.product_id = p.id AND r.branch_id = b.id
  )
LIMIT 21;  -- 7 products × 3 branches

-- ════════════════════════════════════════════════════════════
-- 4. Seed inventory_transfers (was transfers)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_davao    INTEGER;
  v_gensan   INTEGER;
  v_oriental INTEGER;
  v_submitter INTEGER;
  v_approver  INTEGER;
  v_p1 INTEGER; v_p2 INTEGER; v_p3 INTEGER;
BEGIN
  SELECT id INTO v_davao    FROM branches WHERE name = 'Davao City Branch'    LIMIT 1;
  SELECT id INTO v_gensan   FROM branches WHERE name = 'General Santos Branch' LIMIT 1;
  SELECT id INTO v_oriental FROM branches WHERE name = 'Davao Oriental Branch' LIMIT 1;

  SELECT u.id INTO v_submitter
  FROM users u JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'inventory_staff' AND u.status = 'Active' LIMIT 1;

  IF v_submitter IS NULL THEN
    SELECT u.id INTO v_submitter
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE r.slug = 'branch_manager' AND u.status = 'Active' LIMIT 1;
  END IF;

  SELECT u.id INTO v_approver
  FROM users u JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'operating_manager' AND u.status = 'Active' LIMIT 1;

  SELECT id INTO v_p1 FROM products ORDER BY id LIMIT 1;
  SELECT id INTO v_p2 FROM products ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_p3 FROM products ORDER BY id OFFSET 2 LIMIT 1;

  -- Transfer 1: Davao → GenSan, Completed
  IF NOT EXISTS (SELECT 1 FROM inventory_transfers WHERE transfer_ref = 'TRF-2026-0001') THEN
    INSERT INTO inventory_transfers
      (transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
       status, submitted_by, approved_by, approval_info, submitted_date, completed_date)
    VALUES
      ('TRF-2026-0001', v_p1, 5, v_davao, v_gensan,
       'Completed', v_submitter, v_approver,
       'Approved — routine stock rebalancing',
       CURRENT_DATE - 18, CURRENT_DATE - 15);
  END IF;

  -- Transfer 2: GenSan → Davao Oriental, Completed
  IF NOT EXISTS (SELECT 1 FROM inventory_transfers WHERE transfer_ref = 'TRF-2026-0002') THEN
    INSERT INTO inventory_transfers
      (transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
       status, submitted_by, approved_by, approval_info, submitted_date, completed_date)
    VALUES
      ('TRF-2026-0002', v_p2, 3, v_gensan, v_oriental,
       'Completed', v_submitter, v_approver,
       'Approved — branch request',
       CURRENT_DATE - 14, CURRENT_DATE - 12);
  END IF;

  -- Transfer 3: Davao → GenSan, Approved (not yet completed)
  IF NOT EXISTS (SELECT 1 FROM inventory_transfers WHERE transfer_ref = 'TRF-2026-0003') THEN
    INSERT INTO inventory_transfers
      (transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
       status, submitted_by, approved_by, approval_info, submitted_date)
    VALUES
      ('TRF-2026-0003', v_p3, 4, v_davao, v_gensan,
       'Approved', v_submitter, v_approver,
       'Approved — awaiting pickup',
       CURRENT_DATE - 7);
  END IF;

  -- Transfer 4: Davao Oriental → Davao, Pending Approval
  IF NOT EXISTS (SELECT 1 FROM inventory_transfers WHERE transfer_ref = 'TRF-2026-0004') THEN
    INSERT INTO inventory_transfers
      (transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
       status, submitted_by, submitted_date)
    VALUES
      ('TRF-2026-0004', v_p1, 2, v_oriental, v_davao,
       'Pending Approval', v_submitter,
       CURRENT_DATE - 3);
  END IF;

  -- Transfer 5: GenSan → Davao, Submitted
  IF NOT EXISTS (SELECT 1 FROM inventory_transfers WHERE transfer_ref = 'TRF-2026-0005') THEN
    INSERT INTO inventory_transfers
      (transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
       status, submitted_by, submitted_date)
    VALUES
      ('TRF-2026-0005', v_p2, 6, v_gensan, v_davao,
       'Submitted', v_submitter,
       CURRENT_DATE - 1);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 5. Ensure collection_payment has collector names joinable
--    (no changes needed — payments already reference collector_id FK)
--    Update collector_id on any payments missing it
-- ════════════════════════════════════════════════════════════
UPDATE collection_payment cp
SET collector_id = (
  SELECT u.id FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'collector' AND u.branch_id = cp.branch_id
  ORDER BY u.id LIMIT 1
)
WHERE cp.collector_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM users WHERE id = cp.collector_id
);

COMMIT;
