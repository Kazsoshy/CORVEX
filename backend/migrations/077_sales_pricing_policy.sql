BEGIN;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS payment_arrangement VARCHAR(20),
  ADD COLUMN IF NOT EXISTS original_total_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(6,5) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_obligation DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS pricing_policy_version VARCHAR(50),
  ADD COLUMN IF NOT EXISTS purchase_bracket VARCHAR(30),
  ADD COLUMN IF NOT EXISTS original_maturity_date DATE;

CREATE TABLE IF NOT EXISTS sales_invoice_installments (
  installment_id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(sales_invoices_id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  scheduled_amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'Open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (invoice_id, installment_number)
);

CREATE TABLE IF NOT EXISTS sales_invoice_adjustments (
  adjustment_id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(sales_invoices_id),
  adjustment_type VARCHAR(40) NOT NULL,
  original_total_amount DECIMAL(12,2) NOT NULL,
  discount_rate DECIMAL(6,5) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL,
  resulting_obligation DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  authorized_by INTEGER REFERENCES users(id),
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE sales_invoices
SET original_total_amount = COALESCE(original_total_amount, total_amount),
    final_obligation = COALESCE(final_obligation, total_amount),
    payment_arrangement = COALESCE(payment_arrangement, CASE WHEN pay_type = 'installment' THEN 'installment' ELSE 'full' END)
WHERE original_total_amount IS NULL OR final_obligation IS NULL OR payment_arrangement IS NULL;

COMMIT;
