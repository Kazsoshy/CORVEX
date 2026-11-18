-- Verify-only identity tickets (no draft customer) + OM-approved customer branch transfers.

CREATE TABLE IF NOT EXISTS customer_identity_verifications (
  verification_id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Same Person', 'Different Person', 'Cancelled')),
  search_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_registration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_match_customer_id INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
  decision_note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  clearance_token UUID,
  clearance_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_identity_verifications_branch_status
  ON customer_identity_verifications (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_identity_verifications_clearance
  ON customer_identity_verifications (clearance_token)
  WHERE clearance_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_branch_transfers (
  transfer_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  source_branch_id INTEGER NOT NULL REFERENCES branches(id),
  target_branch_id INTEGER NOT NULL REFERENCES branches(id),
  target_territory_id INTEGER REFERENCES territories(territory_id),
  status VARCHAR(30) NOT NULL DEFAULT 'Pending Source'
    CHECK (status IN (
      'Pending Source',
      'Pending OM',
      'Needs Revision',
      'Approved',
      'Rejected',
      'Cancelled'
    )),
  reason TEXT,
  revision_note TEXT,
  rejection_note TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  source_bm_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  om_decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_branch_transfers_status
  ON customer_branch_transfers (status);

CREATE INDEX IF NOT EXISTS idx_customer_branch_transfers_customer
  ON customer_branch_transfers (customer_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_branch_transfers_open
  ON customer_branch_transfers (customer_id)
  WHERE status IN ('Pending Source', 'Pending OM', 'Needs Revision');
