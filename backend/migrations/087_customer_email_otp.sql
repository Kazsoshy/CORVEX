-- Registration-time email OTP: prove portal_email ownership via SMTP before customer create.
-- Mobile remains SA attestation (phone_verification_status); SMS OTP is out of this release.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email_verification_status VARCHAR(20) NOT NULL DEFAULT 'Unverified';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_email_verification_status_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_email_verification_status_check
      CHECK (email_verification_status IN ('Unverified', 'Verified'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS customer_email_otp_challenges (
  id SERIAL PRIMARY KEY,
  email_normalized VARCHAR(255) NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_email_otp_email_created
  ON customer_email_otp_challenges (email_normalized, created_at DESC);
