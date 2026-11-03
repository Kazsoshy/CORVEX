-- ============================================================
-- CORVEX — Migration 055: Sales invoice payment terms
-- Persists Pay in Full vs Installment (monthly) on sales_invoices.
-- ============================================================

BEGIN;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS pay_type VARCHAR(20) NOT NULL DEFAULT 'full';

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS down_payment DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS term_months INTEGER;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS monthly_amount DECIMAL(12, 2);

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS first_due_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_invoices_pay_type_check'
  ) THEN
    ALTER TABLE sales_invoices
      ADD CONSTRAINT sales_invoices_pay_type_check
      CHECK (pay_type IN ('full', 'installment'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_invoices_down_payment_check'
  ) THEN
    ALTER TABLE sales_invoices
      ADD CONSTRAINT sales_invoices_down_payment_check
      CHECK (down_payment >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_invoices_term_months_check'
  ) THEN
    ALTER TABLE sales_invoices
      ADD CONSTRAINT sales_invoices_term_months_check
      CHECK (term_months IS NULL OR (term_months >= 1 AND term_months <= 24));
  END IF;
END $$;

COMMIT;
