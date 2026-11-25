-- Allow Rejected status for declined Pending Identity Review / territory-exception
-- registrations so SA can reopen the same customer_id without creating a duplicate.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_status_check'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_status_check;
  END IF;
  ALTER TABLE customers
    ADD CONSTRAINT customers_status_check
    CHECK (status IN ('Active', 'Inactive', 'Pending Identity Review', 'Rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Rows previously declined via identity/territory review were stored as Inactive.
UPDATE customers
SET status = 'Rejected',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'Inactive'
  AND identity_reviewed_at IS NOT NULL;
