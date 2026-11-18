-- SA cash registration: identity hold status, privacy/marketing, UI phone verify, match evidence.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS name_suffix VARCHAR(20);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS privacy_notice_acknowledged_at TIMESTAMPTZ;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS privacy_notice_version VARCHAR(40);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone_verification_status VARCHAR(20) NOT NULL DEFAULT 'Unverified';

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS identity_match_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS identity_review_note TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS identity_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS identity_reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_status_check'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_status_check;
  END IF;
  ALTER TABLE customers
    ADD CONSTRAINT customers_status_check
    CHECK (status IN ('Active', 'Inactive', 'Pending Identity Review'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_phone_verification_status_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_phone_verification_status_check
      CHECK (phone_verification_status IN ('Unverified', 'Verified'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_identity_review_queue
  ON customers (branch_id, status)
  WHERE status = 'Pending Identity Review';
