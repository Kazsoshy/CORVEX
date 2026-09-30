-- Standard demo password (Corvex@2026) and consolidate seeded operational data under Davao City Branch
BEGIN;

UPDATE users
SET password_hash = '$2b$12$qG9oaeYKfYX.XJGxMx7GUOfJ/nnDwBchIFYLkT0xDCaU7pPivRiG6',
    updated_at = CURRENT_TIMESTAMP;

DO $$
DECLARE
  v_davao INTEGER;
BEGIN
  SELECT id INTO v_davao FROM branches WHERE name ILIKE '%Davao City%' LIMIT 1;
  IF v_davao IS NULL THEN
    RAISE NOTICE '037: Davao City branch not found — skipping branch consolidation.';
    RETURN;
  END IF;

  -- Customers and branch-scoped staff (keep org roles unscoped)
  UPDATE customers SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;

  UPDATE users u
  SET branch_id = v_davao,
      updated_at = CURRENT_TIMESTAMP
  FROM roles r
  WHERE u.role_id = r.role_id
    AND u.branch_id IS DISTINCT FROM v_davao
    AND r.slug NOT IN ('super_admin', 'operating_manager', 'customer');

  -- Territories tied to branch
  UPDATE territories SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;

  -- Operations / approvals demo tables (when present)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_investigations') THEN
    UPDATE credit_investigations SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'special_collection_requests') THEN
    UPDATE special_collection_requests SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'operational_alerts') THEN
    UPDATE operational_alerts SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;
  END IF;

  -- Transactions & inventory scoped by branch
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_invoices' AND column_name = 'branch_id') THEN
    UPDATE sales_invoices SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'collection_payment' AND column_name = 'branch_id') THEN
    UPDATE collection_payment SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_requests' AND column_name = 'branch_id') THEN
    UPDATE purchase_requests SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;
  END IF;

  -- Branch inventory: drop duplicate SKUs on other branches, then move remainder to Davao City
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branch_inventory') THEN
    DELETE FROM branch_inventory bi
    WHERE bi.branch_id IS DISTINCT FROM v_davao
      AND EXISTS (
        SELECT 1 FROM branch_inventory keep
        WHERE keep.branch_id = v_davao AND keep.product_id = bi.product_id
      );
    UPDATE branch_inventory SET branch_id = v_davao WHERE branch_id IS DISTINCT FROM v_davao;
  END IF;

  -- Transfers must keep source <> destination; drop transfers that do not involve Davao City
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_transfers') THEN
    DELETE FROM inventory_transfers
    WHERE source_branch_id IS DISTINCT FROM v_davao
      AND destination_branch_id IS DISTINCT FROM v_davao;
  END IF;

  -- Align demo notification copy with Davao City focus
  UPDATE notifications
  SET message = REPLACE(REPLACE(message, 'Davao Oriental', 'Davao City'), 'General Santos', 'Davao City')
  WHERE message ILIKE '%Davao Oriental%' OR message ILIKE '%General Santos%';

  RAISE NOTICE '037: Seeded data consolidated under Davao City branch (id=%).', v_davao;
END $$;

COMMIT;
