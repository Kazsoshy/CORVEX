-- Customer portal: link customer records to invited user accounts + purchase requests
BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_email VARCHAR(150);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_status VARCHAR(30) NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_portal_status_check'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_portal_status_check
      CHECK (portal_status IN ('none', 'pending', 'invited', 'active'));
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('Active', 'Inactive', 'Invited'));

CREATE TABLE IF NOT EXISTS customer_portal_invitations (
  invitation_id   SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      VARCHAR(64) NOT NULL UNIQUE,
  expires_at      TIMESTAMP NOT NULL,
  activated_at    TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_invitations_customer ON customer_portal_invitations(customer_id);

CREATE TABLE IF NOT EXISTS purchase_requests (
  request_id        SERIAL PRIMARY KEY,
  customer_id       INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  branch_id         INTEGER NOT NULL REFERENCES branches(id),
  sales_agent_id    INTEGER REFERENCES users(id),
  status            VARCHAR(30) NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending', 'In Review', 'Confirmed', 'Rejected', 'Cancelled')),
  notes             TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_purchase_requests_updated_at
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS purchase_request_items (
  item_id       SERIAL PRIMARY KEY,
  request_id    INTEGER NOT NULL REFERENCES purchase_requests(request_id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_customer ON purchase_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_agent ON purchase_requests(sales_agent_id);

COMMIT;
