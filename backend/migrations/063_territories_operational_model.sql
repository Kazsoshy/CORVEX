-- Make territories operational master data: status, geometry, default personnel.

ALTER TABLE territories
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'territories_status_check'
  ) THEN
    ALTER TABLE territories
      ADD CONSTRAINT territories_status_check
      CHECK (status IN ('Active', 'Inactive'));
  END IF;
END $$;

ALTER TABLE territories
  ALTER COLUMN coverage_area DROP NOT NULL;

ALTER TABLE territories
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS radius_meters INTEGER NOT NULL DEFAULT 800;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'territories_radius_meters_check'
  ) THEN
    ALTER TABLE territories
      ADD CONSTRAINT territories_radius_meters_check
      CHECK (radius_meters >= 100 AND radius_meters <= 20000);
  END IF;
END $$;

ALTER TABLE territories
  ADD COLUMN IF NOT EXISTS default_sales_agent_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS default_collector_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_territories_branch_status
  ON territories (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_territories_default_sales_agent
  ON territories (default_sales_agent_id);

CREATE INDEX IF NOT EXISTS idx_territories_default_collector
  ON territories (default_collector_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_territories_branch_name_active
  ON territories (branch_id, lower(btrim(territory_name)))
  WHERE status = 'Active';

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_territories_updated_at ON territories;
  CREATE TRIGGER trg_territories_updated_at
    BEFORE UPDATE ON territories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION
  WHEN undefined_function THEN
    NULL; -- set_updated_at may be named differently on legacy DBs
END $$;

-- Best-effort backfill of defaults from existing assignment chips / assigned_user.
UPDATE territories t
SET default_sales_agent_id = sub.user_id
FROM (
  SELECT DISTINCT ON (ta.territory_id) ta.territory_id, ta.user_id
  FROM territory_assignments ta
  JOIN users u ON u.id = ta.user_id
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'sales_staff'
  ORDER BY ta.territory_id, ta.assignment_id
) sub
WHERE t.territory_id = sub.territory_id
  AND t.default_sales_agent_id IS NULL;

UPDATE territories t
SET default_collector_id = sub.user_id
FROM (
  SELECT DISTINCT ON (ta.territory_id) ta.territory_id, ta.user_id
  FROM territory_assignments ta
  JOIN users u ON u.id = ta.user_id
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'collector'
  ORDER BY ta.territory_id, ta.assignment_id
) sub
WHERE t.territory_id = sub.territory_id
  AND t.default_collector_id IS NULL;

UPDATE territories t
SET default_collector_id = t.assigned_user
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE t.assigned_user = u.id
  AND r.slug = 'collector'
  AND t.default_collector_id IS NULL;

UPDATE territories t
SET default_sales_agent_id = t.assigned_user
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE t.assigned_user = u.id
  AND r.slug = 'sales_staff'
  AND t.default_sales_agent_id IS NULL;
