-- Persist SA waiting-screen lifecycle + link identity tickets to branch transfers.

ALTER TABLE customer_identity_verifications
  ADD COLUMN IF NOT EXISTS linked_transfer_id INTEGER REFERENCES customer_branch_transfers(transfer_id) ON DELETE SET NULL;

ALTER TABLE customer_identity_verifications
  ADD COLUMN IF NOT EXISTS registration_attempt_key VARCHAR(64);

-- Expand status lifecycle (drop old check if present, then re-add).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'customer_identity_verifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE customer_identity_verifications DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE customer_identity_verifications
  DROP CONSTRAINT IF EXISTS customer_identity_verifications_status_check;

ALTER TABLE customer_identity_verifications
  ADD CONSTRAINT customer_identity_verifications_status_check
  CHECK (status IN (
    'Pending',
    'Needs Evidence',
    'Same Person',
    'Different Person',
    'Transfer Linked',
    'Completed',
    'Cancelled'
  ));

-- One open verification per requester + phone across active waiting statuses.
DROP INDEX IF EXISTS uq_identity_verify_open_requester_phone;
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_verify_open_requester_phone
  ON customer_identity_verifications (requested_by, search_phone_normalized)
  WHERE status IN ('Pending', 'Needs Evidence', 'Transfer Linked')
    AND search_phone_normalized IS NOT NULL
    AND search_phone_normalized <> '';

CREATE INDEX IF NOT EXISTS idx_customer_identity_verifications_linked_transfer
  ON customer_identity_verifications (linked_transfer_id)
  WHERE linked_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_identity_verifications_attempt
  ON customer_identity_verifications (registration_attempt_key)
  WHERE registration_attempt_key IS NOT NULL;
