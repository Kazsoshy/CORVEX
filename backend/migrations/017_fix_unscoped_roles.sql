-- ============================================================
-- CORVEX — Migration 017: Fix branch_id for unscoped roles
--
-- Operating Manager and Super Admin must have branch_id = NULL
-- so the requireAuth middleware sets user.branchId = null,
-- which causes all backend queries to return data for ALL branches.
--
-- The users.branch_id column had NOT NULL — drop that constraint first.
-- ============================================================

BEGIN;

-- 1. Drop the NOT NULL constraint on users.branch_id
--    (OM and SA are org-level roles, not tied to one branch)
ALTER TABLE users ALTER COLUMN branch_id DROP NOT NULL;

-- 2. Set branch_id = NULL for operating_manager and super_admin
UPDATE users
SET branch_id = NULL, updated_at = NOW()
WHERE role_id IN (
  SELECT role_id FROM roles WHERE slug IN ('operating_manager', 'super_admin')
);

-- 3. Verify
DO $$
DECLARE
  scoped_count INT;
BEGIN
  SELECT COUNT(*) INTO scoped_count
  FROM users u JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug IN ('operating_manager', 'super_admin')
    AND u.branch_id IS NOT NULL;

  IF scoped_count > 0 THEN
    RAISE EXCEPTION '% OM/SA users still have a branch_id set', scoped_count;
  END IF;

  RAISE NOTICE 'Migration 017 complete: OM and SA users now have branch_id = NULL';
END $$;

COMMIT;
