-- ============================================================
-- CORVEX — Migration 014: ACM Schema Alignment
-- Aligns the live database with the ACM document requirements.
--
-- CHANGES:
--   1. branches        — ADD region, manager; RENAME contact_no → phone
--   2. customers       — ADD account_manager_id, territory_id (keep user_id)
--   3. branch_inventory — ADD quantity, status (keep available_stock)
--   4. sales_invoices  — ADD due_date
--   5. stock_movements  — ADD branch_id FK
--   6. transfers        — RENAME to inventory_transfers
--   7. restock_records  — RENAME to restocks
--
-- SAFETY:
--   - All new columns are nullable (no NOT NULL) to protect existing rows.
--   - All renames use ALTER TABLE ... RENAME TO / RENAME COLUMN.
--   - No data is deleted.
--   - Idempotent guards via IF NOT EXISTS / information_schema checks.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1. BRANCHES TABLE
-- ════════════════════════════════════════════════════════════

-- 1a. RENAME contact_no → phone
--     Guard: only rename if contact_no still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'contact_no'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'phone'
  ) THEN
    ALTER TABLE branches RENAME COLUMN contact_no TO phone;
  END IF;
END $$;

-- 1b. ADD region (nullable VARCHAR)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS region VARCHAR(100);

-- 1c. ADD manager (nullable FK → users.id)
--     Uses users.id because 000_prepare renamed user_id → id
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_branches_manager'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT fk_branches_manager
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON branches(manager_id);

-- ════════════════════════════════════════════════════════════
-- 2. CUSTOMERS TABLE
-- ════════════════════════════════════════════════════════════

-- 2a. KEEP existing user_id — confirmed present, do NOT touch it.

-- 2b. ADD account_manager_id (nullable FK → users.id)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_manager_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_customers_account_manager'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT fk_customers_account_manager
      FOREIGN KEY (account_manager_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_account_manager_id ON customers(account_manager_id);

-- 2c. ADD territory_id (nullable FK → territories.territory_id)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS territory_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_customers_territory'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT fk_customers_territory
      FOREIGN KEY (territory_id) REFERENCES territories(territory_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_territory_id ON customers(territory_id);

-- ════════════════════════════════════════════════════════════
-- 3. BRANCH_INVENTORY TABLE
-- ════════════════════════════════════════════════════════════

-- 3a. KEEP existing available_stock — confirmed present, do NOT touch it.

-- 3b. ADD quantity (nullable INTEGER)
--     Purpose: ACM-required field. Distinct from available_stock
--     (quantity = physical count on shelf; available_stock = available for sale
--     after reservations). Both are meaningful and kept.
ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS quantity INTEGER;

-- 3c. ADD status (nullable VARCHAR)
--     Computed status: 'Sufficient' | 'Low Stock' | 'Out of Stock'
--     Stored for fast filtering; kept in sync by application logic.
ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS status VARCHAR(30)
  CHECK (status IN ('Sufficient', 'Low Stock', 'Critical Stock', 'Out of Stock'));

-- 3d. ADD last_updated (for products.js compatibility — it queries i.last_updated)
ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP;

-- 3e. ADD stock_status (for products.js compatibility — it queries i.stock_status)
ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS stock_status VARCHAR(30);

-- 3f. Back-fill quantity from available_stock for existing rows
UPDATE branch_inventory
SET
  quantity     = available_stock,
  status       = CASE
                   WHEN available_stock <= 0             THEN 'Out of Stock'
                   WHEN available_stock <= reorder_level THEN 'Low Stock'
                   ELSE                                       'Sufficient'
                 END,
  stock_status = CASE
                   WHEN available_stock <= 0                       THEN 'Out of Stock'
                   WHEN available_stock <= reorder_level * 0.3     THEN 'Critical Stock'
                   WHEN available_stock <= reorder_level           THEN 'Low Stock'
                   ELSE                                                 'Sufficient'
                 END,
  last_updated = updated_at
WHERE quantity IS NULL;

-- ════════════════════════════════════════════════════════════
-- 4. SALES_INVOICES TABLE
-- ════════════════════════════════════════════════════════════

-- 4a. ADD due_date (nullable DATE)
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS due_date DATE;

-- 4b. Back-fill due_date as 30 days after invoice date for existing records
UPDATE sales_invoices
SET due_date = invoices_date + INTERVAL '30 days'
WHERE due_date IS NULL;

-- ════════════════════════════════════════════════════════════
-- 5. STOCK_MOVEMENTS TABLE
-- ════════════════════════════════════════════════════════════

-- 5a. ADD branch_id (nullable FK → branches.id)
--     Nullable because 000_prepare renamed branch_id PK → id on branches
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS branch_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stock_movements_branch'
  ) THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT fk_stock_movements_branch
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_id ON stock_movements(branch_id);

-- ════════════════════════════════════════════════════════════
-- 6. RENAME transfers → inventory_transfers
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'transfers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'inventory_transfers'
  ) THEN
    ALTER TABLE transfers RENAME TO inventory_transfers;
  END IF;
END $$;

-- Rename the trigger to match new table name (drop old, recreate)
DO $$
BEGIN
  -- Drop old trigger name if it exists on the renamed table
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_transfers_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_transfers_updated_at ON inventory_transfers;
  END IF;
END $$;

-- Recreate trigger with new name on inventory_transfers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_inventory_transfers_updated_at'
  ) THEN
    CREATE TRIGGER trg_inventory_transfers_updated_at
      BEFORE UPDATE ON inventory_transfers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Rename indexes for inventory_transfers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transfers_product_id') THEN
    ALTER INDEX idx_transfers_product_id         RENAME TO idx_inventory_transfers_product_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transfers_source_branch_id') THEN
    ALTER INDEX idx_transfers_source_branch_id   RENAME TO idx_inventory_transfers_source_branch_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transfers_destination_branch_id') THEN
    ALTER INDEX idx_transfers_destination_branch_id RENAME TO idx_inventory_transfers_destination_branch_id;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 7. RENAME restock_records → restocks
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'restock_records'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'restocks'
  ) THEN
    ALTER TABLE restock_records RENAME TO restocks;
  END IF;
END $$;

-- Rename indexes for restocks
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_restock_records_product_id') THEN
    ALTER INDEX idx_restock_records_product_id RENAME TO idx_restocks_product_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_restock_records_branch_id') THEN
    ALTER INDEX idx_restock_records_branch_id  RENAME TO idx_restocks_branch_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_restock_records_supplier_id') THEN
    ALTER INDEX idx_restock_records_supplier_id RENAME TO idx_restocks_supplier_id;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run mentally — no side effects)
-- ════════════════════════════════════════════════════════════
-- SELECT column_name FROM information_schema.columns WHERE table_name='branches';
-- SELECT column_name FROM information_schema.columns WHERE table_name='customers';
-- SELECT column_name FROM information_schema.columns WHERE table_name='branch_inventory';
-- SELECT column_name FROM information_schema.columns WHERE table_name='sales_invoices';
-- SELECT column_name FROM information_schema.columns WHERE table_name='stock_movements';
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('inventory_transfers','restocks');

COMMIT;
