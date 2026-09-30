-- Link fulfilled purchase requests to sales invoices
BEGIN;

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS sales_invoices_id INTEGER REFERENCES sales_invoices(sales_invoices_id);

ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN ('Pending', 'In Review', 'Confirmed', 'Rejected', 'Cancelled', 'Invoiced'));

COMMIT;
