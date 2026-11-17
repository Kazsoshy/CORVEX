-- Customer registration profile + schedule linkage for credit-connected onboarding.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) NOT NULL DEFAULT 'Individual'
    CHECK (customer_type IN ('Individual', 'Business'));

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(200);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS registration_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS source_assignment_id INTEGER REFERENCES sales_area_assignments(assignment_id) ON DELETE SET NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS territory_override_note TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS estimated_monthly_revenue DECIMAL(14, 2);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS estimated_monthly_expenses DECIMAL(14, 2);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS existing_obligations DECIMAL(14, 2);

CREATE INDEX IF NOT EXISTS idx_customers_source_assignment
  ON customers (source_assignment_id)
  WHERE source_assignment_id IS NOT NULL;

INSERT INTO system_settings (setting_key, setting_value, updated_at)
VALUES (
  'credit_suggestion_policies',
  '{
    "revenue_fraction": 0.3,
    "max_first_limit": 50000,
    "min_first_limit": 1000,
    "require_evidence_for_suggestion": false,
    "territory_buffer_meters": 250,
    "offline_credit_max_age_hours": 24
  }'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT (setting_key) DO NOTHING;
