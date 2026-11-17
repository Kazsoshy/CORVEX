-- Geography-first territories: barangay identity, clear default personnel requirements.
-- default_* columns remain nullable legacy; no longer required for Active territories.

ALTER TABLE territories
  ADD COLUMN IF NOT EXISTS barangay_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS barangay_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS municipality_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS province_name VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_territories_barangay_code
  ON territories (barangay_code)
  WHERE barangay_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_territories_barangay_name
  ON territories (lower(btrim(barangay_name)))
  WHERE barangay_name IS NOT NULL;

-- Clear permanent staff defaults (geography ≠ personnel). Historical assignments elsewhere are untouched.
UPDATE territories
SET default_sales_agent_id = NULL,
    default_collector_id = NULL,
    assigned_user = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE default_sales_agent_id IS NOT NULL
   OR default_collector_id IS NOT NULL
   OR assigned_user IS NOT NULL;

-- Seed OM territory policy (mode off — no silent auto-deactivate).
INSERT INTO system_settings (setting_key, setting_value, updated_at)
VALUES (
  'territory_policies',
  '{"inactivityDays":90,"usageSignals":{"assignments":true,"sales":true,"collections":true,"customerActivity":true},"blockers":{"activeCustomers":true,"overdueBalances":true,"openAssignments":true},"mode":"off","notifyBranchManager":true,"preserveHistory":true}',
  CURRENT_TIMESTAMP
)
ON CONFLICT (setting_key) DO NOTHING;
