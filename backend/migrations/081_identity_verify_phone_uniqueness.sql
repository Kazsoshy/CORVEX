-- One open Pending identity verification per requester + normalized phone.
-- Prevents SA ticket spam for the same search phone while BM decides.

ALTER TABLE customer_identity_verifications
  ADD COLUMN IF NOT EXISTS search_phone_normalized VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_verify_open_requester_phone
  ON customer_identity_verifications (requested_by, search_phone_normalized)
  WHERE status = 'Pending'
    AND search_phone_normalized IS NOT NULL
    AND search_phone_normalized <> '';

CREATE INDEX IF NOT EXISTS idx_customer_identity_verifications_requester
  ON customer_identity_verifications (requested_by, status);
