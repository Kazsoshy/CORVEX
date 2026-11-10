-- Credit investigation recommendations + CI revision history support.

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS revision_history_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMP;

ALTER TABLE credit_investigations
  ADD COLUMN IF NOT EXISTS resubmitted_by INTEGER REFERENCES users(id);

CREATE TABLE IF NOT EXISTS credit_recommendations (
  recommendation_id   SERIAL PRIMARY KEY,
  customer_id         INTEGER NOT NULL REFERENCES customers(customer_id),
  branch_id           INTEGER NOT NULL REFERENCES branches(id),
  recommendation_type VARCHAR(40) NOT NULL,
  trigger_reason      TEXT NOT NULL,
  evidence_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level          VARCHAR(20),
  risk_score          INTEGER,
  suggested_action    TEXT,
  status              VARCHAR(30) NOT NULL DEFAULT 'New'
                      CHECK (status IN ('New', 'Watching', 'Converted to CI', 'Dismissed')),
  converted_ci_id     INTEGER REFERENCES credit_investigations(ci_id) ON DELETE SET NULL,
  dismissed_reason    TEXT,
  dismissed_by        INTEGER REFERENCES users(id),
  dismissed_at        TIMESTAMP,
  generated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_evaluated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_recommendations_branch_status
  ON credit_recommendations (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_credit_recommendations_customer
  ON credit_recommendations (customer_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_recommendations_open_type
  ON credit_recommendations (customer_id, recommendation_type)
  WHERE status IN ('New', 'Watching');
