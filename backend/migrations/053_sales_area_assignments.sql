-- ============================================================
-- CORVEX — Migration 053: Sales area assignments (canvassing)
-- Daily/period territory assignments for Sales Agents.
-- Separate from customer-required field_visits (collector/visit model).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS sales_area_assignments (
  assignment_id   SERIAL PRIMARY KEY,
  branch_id       INTEGER NOT NULL REFERENCES branches(id),
  sales_agent_id  INTEGER NOT NULL REFERENCES users(id),
  assigned_by     INTEGER REFERENCES users(id),
  territory_id    INTEGER REFERENCES territories(territory_id) ON DELETE SET NULL,
  area_name       VARCHAR(150) NOT NULL,
  coverage_notes  TEXT,
  work_date       DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'Assigned'
                  CHECK (status IN ('Assigned', 'In Progress', 'Done')),
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  radius_meters   INTEGER NOT NULL DEFAULT 800
                  CHECK (radius_meters >= 100 AND radius_meters <= 20000),
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_area_assignments_agent_date
  ON sales_area_assignments (sales_agent_id, work_date);
CREATE INDEX IF NOT EXISTS idx_sales_area_assignments_branch_date
  ON sales_area_assignments (branch_id, work_date);
CREATE INDEX IF NOT EXISTS idx_sales_area_assignments_status
  ON sales_area_assignments (status);

DROP TRIGGER IF EXISTS trg_sales_area_assignments_updated_at ON sales_area_assignments;
CREATE TRIGGER trg_sales_area_assignments_updated_at
  BEFORE UPDATE ON sales_area_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sales_area_assignment_products (
  assignment_id INTEGER NOT NULL REFERENCES sales_area_assignments(assignment_id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, product_id)
);

-- Seed: today's + nearby assignments for active sales agents using branch territories/coords
INSERT INTO sales_area_assignments (
  branch_id, sales_agent_id, assigned_by, territory_id, area_name, coverage_notes,
  work_date, status, latitude, longitude, radius_meters
)
SELECT
  u.branch_id,
  u.id,
  bm.id,
  t.territory_id,
  COALESCE(t.territory_name, b.name || ' Canvass Area'),
  COALESCE(
    NULLIF(TRIM(t.coverage_area), ''),
    'Canvass this area and register new customers. Focus on furniture prospects.'
  ),
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,
  'Assigned',
  b.latitude,
  b.longitude,
  900
FROM users u
JOIN roles r ON r.role_id = u.role_id AND r.slug = 'sales_staff'
JOIN branches b ON b.id = u.branch_id
LEFT JOIN LATERAL (
  SELECT t.territory_id, t.territory_name, t.coverage_area
  FROM territories t
  WHERE t.branch_id = u.branch_id
  ORDER BY t.territory_id
  LIMIT 1
) t ON TRUE
LEFT JOIN LATERAL (
  SELECT bm.id
  FROM users bm
  JOIN roles bmr ON bmr.role_id = bm.role_id AND bmr.slug = 'branch_manager'
  WHERE bm.branch_id = u.branch_id AND bm.status = 'Active'
  ORDER BY bm.id
  LIMIT 1
) bm ON TRUE
WHERE u.status = 'Active'
  AND u.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sales_area_assignments saa
    WHERE saa.sales_agent_id = u.id
      AND saa.work_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
  );

-- One past Done assignment per agent (history demo) when none exist
INSERT INTO sales_area_assignments (
  branch_id, sales_agent_id, assigned_by, territory_id, area_name, coverage_notes,
  work_date, status, latitude, longitude, radius_meters, started_at, completed_at
)
SELECT
  u.branch_id,
  u.id,
  bm.id,
  t.territory_id,
  COALESCE(t.territory_name, b.name || ' Prior Area') || ' (prior)',
  'Previous canvass day — recorded for schedule history.',
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - 3,
  'Done',
  b.latitude,
  b.longitude,
  800,
  ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - 3) + TIME '08:30',
  ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - 3) + TIME '16:00'
FROM users u
JOIN roles r ON r.role_id = u.role_id AND r.slug = 'sales_staff'
JOIN branches b ON b.id = u.branch_id
LEFT JOIN LATERAL (
  SELECT t.territory_id, t.territory_name
  FROM territories t
  WHERE t.branch_id = u.branch_id
  ORDER BY t.territory_id
  LIMIT 1
) t ON TRUE
LEFT JOIN LATERAL (
  SELECT bm.id
  FROM users bm
  JOIN roles bmr ON bmr.role_id = bm.role_id AND bmr.slug = 'branch_manager'
  WHERE bm.branch_id = u.branch_id AND bm.status = 'Active'
  ORDER BY bm.id
  LIMIT 1
) bm ON TRUE
WHERE u.status = 'Active'
  AND u.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sales_area_assignments saa
    WHERE saa.sales_agent_id = u.id AND saa.status = 'Done'
  );

-- Upcoming sample (day after tomorrow) for agents that have a second territory
INSERT INTO sales_area_assignments (
  branch_id, sales_agent_id, assigned_by, territory_id, area_name, coverage_notes,
  work_date, status, latitude, longitude, radius_meters
)
SELECT
  u.branch_id,
  u.id,
  bm.id,
  t.territory_id,
  t.territory_name,
  COALESCE(NULLIF(TRIM(t.coverage_area), ''), 'Upcoming canvass assignment from Branch Head.'),
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 2,
  'Assigned',
  b.latitude,
  b.longitude,
  850
FROM users u
JOIN roles r ON r.role_id = u.role_id AND r.slug = 'sales_staff'
JOIN branches b ON b.id = u.branch_id
JOIN LATERAL (
  SELECT t.territory_id, t.territory_name, t.coverage_area
  FROM territories t
  WHERE t.branch_id = u.branch_id
  ORDER BY t.territory_id DESC
  LIMIT 1
) t ON TRUE
LEFT JOIN LATERAL (
  SELECT bm.id
  FROM users bm
  JOIN roles bmr ON bmr.role_id = bm.role_id AND bmr.slug = 'branch_manager'
  WHERE bm.branch_id = u.branch_id AND bm.status = 'Active'
  ORDER BY bm.id
  LIMIT 1
) bm ON TRUE
WHERE u.status = 'Active'
  AND u.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sales_area_assignments saa
    WHERE saa.sales_agent_id = u.id
      AND saa.work_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 2
  );

-- Attach up to 2 active products as "products to push" on today's assignments
INSERT INTO sales_area_assignment_products (assignment_id, product_id)
SELECT saa.assignment_id, p.id
FROM sales_area_assignments saa
JOIN LATERAL (
  SELECT p.id
  FROM products p
  WHERE p.status = 'Active'
  ORDER BY p.id
  LIMIT 2
) p ON TRUE
WHERE saa.work_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
ON CONFLICT DO NOTHING;

COMMIT;
