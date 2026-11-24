-- 090_branch_gcash_spot_cash.sql
-- Branch GCash QR/account settings for Spot Cash GCash sales,
-- plus sales_invoices.spot_cash_settlement for Cash pickup tracking.
-- Scope: approved Spot Cash settlement flows (branch settings + Log Sale).

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS gcash_account_name VARCHAR(120);

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS gcash_mobile VARCHAR(30);

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS gcash_qr_image TEXT;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS spot_cash_settlement VARCHAR(30);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_spot_cash_settlement_check'
  ) THEN
    ALTER TABLE sales_invoices
      ADD CONSTRAINT sales_invoices_spot_cash_settlement_check
      CHECK (
        spot_cash_settlement IS NULL
        OR spot_cash_settlement IN ('awaiting_pickup', 'gcash_recorded', 'collected')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_spot_cash_settlement
  ON sales_invoices (branch_id, spot_cash_settlement)
  WHERE spot_cash_settlement IS NOT NULL;
