-- =====================================================================
-- CORVEX — Migration 026: Territory Assignments
-- Enables multiple user assignments per territory with role tracking.
-- Migrates existing assigned_user data to the new junction table.
-- =====================================================================
BEGIN;

-- Create the junction table for multiple territory assignments
CREATE TABLE IF NOT EXISTS territory_assignments (
    assignment_id  SERIAL PRIMARY KEY,
    territory_id   INTEGER NOT NULL REFERENCES territories(territory_id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    role_id        INTEGER REFERENCES roles(role_id),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(territory_id, user_id)  -- prevent duplicate assignments
);

-- Migrate existing assigned_user data from territories table
INSERT INTO territory_assignments (territory_id, user_id, role_id)
SELECT
  t.territory_id,
  t.assigned_user,
  u.role_id
FROM territories t
JOIN users u ON u.id = t.assigned_user
WHERE t.assigned_user IS NOT NULL
ON CONFLICT (territory_id, user_id) DO NOTHING;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_territory_assignments_territory ON territory_assignments(territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_assignments_user ON territory_assignments(user_id);

COMMIT;
