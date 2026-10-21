-- Daily reference amounts for collection rate and sales efficiency.
-- Seeded with the amounts the reports already used, so the rates stay the same
-- until a manager changes them.
CREATE TABLE IF NOT EXISTS performance_targets (
  target_key VARCHAR(40) PRIMARY KEY,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO performance_targets (target_key, amount)
VALUES
  ('collection_daily', 180000),
  ('sales_daily', 230000)
ON CONFLICT (target_key) DO NOTHING;
