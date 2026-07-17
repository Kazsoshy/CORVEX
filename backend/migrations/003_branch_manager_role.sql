-- ============================================================
-- CORVEX — Migration 003: Branch Manager Role
-- Adds the branch_manager role, permissions, and seeds one
-- Branch Manager user account per branch.
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
-- ============================================================

-- ============================================================
-- 1. ADD ROLE
-- ============================================================
INSERT INTO roles (name, slug, description)
VALUES ('Branch Manager', 'branch_manager', 'Manages operations, collections, sales, and inventory for a single assigned branch. Can initiate credit recommendations routed to the Operating Manager for final approval.')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 2. ASSIGN PERMISSIONS
-- Branch Manager: view, create, edit, approve (recommend-level),
-- export — scoped to their branch in application logic.
-- Does NOT get manage_users or manage_branches.
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p
WHERE r.slug = 'branch_manager'
  AND p.key IN ('view', 'create', 'edit', 'approve', 'export')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- 3. SEED BRANCH MANAGER USERS  (one per branch)
-- Password: Corvex@2026  (same bcrypt hash used by seed 002)
-- Employee IDs: BM-0001 through BM-0003
-- branch_id resolved by branch name to stay portable.
-- ============================================================
DO $$
DECLARE
    hash_default TEXT := '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm';
    bm_role_id   INT;
    davao_id     INT;
    gensan_id    INT;
    davoriental_id INT;
BEGIN
    SELECT id INTO bm_role_id    FROM roles    WHERE slug = 'branch_manager';
    SELECT id INTO davao_id      FROM branches WHERE name = 'Davao City Branch';
    SELECT id INTO gensan_id     FROM branches WHERE name = 'General Santos Branch';
    SELECT id INTO davoriental_id FROM branches WHERE name = 'Davao Oriental Branch';

    -- Davao City Branch Manager
    INSERT INTO users (
        full_name, username, email, password_hash,
        role_id, branch_id, contact_number, address,
        employee_id, avatar_initials, status
    ) VALUES (
        'Roberto Villanueva', 'roberto.villanueva', 'roberto.villanueva@corvex.ph', hash_default,
        bm_role_id, davao_id, '+63 917 555 0101', 'Davao City',
        'BM-0001', 'RV', 'Active'
    ) ON CONFLICT (email) DO NOTHING;

    -- General Santos Branch Manager
    INSERT INTO users (
        full_name, username, email, password_hash,
        role_id, branch_id, contact_number, address,
        employee_id, avatar_initials, status
    ) VALUES (
        'Miguel Flores', 'miguel.flores', 'miguel.flores@corvex.ph', hash_default,
        bm_role_id, gensan_id, '+63 917 555 0102', 'General Santos City',
        'BM-0002', 'MF', 'Active'
    ) ON CONFLICT (email) DO NOTHING;

    -- Davao Oriental Branch Manager
    INSERT INTO users (
        full_name, username, email, password_hash,
        role_id, branch_id, contact_number, address,
        employee_id, avatar_initials, status
    ) VALUES (
        'Grace Tan', 'grace.tan', 'grace.tan@corvex.ph', hash_default,
        bm_role_id, davoriental_id, '+63 917 555 0103', 'Mati City, Davao Oriental',
        'BM-0003', 'GT', 'Active'
    ) ON CONFLICT (email) DO NOTHING;

    RAISE NOTICE 'Branch Manager role and users seeded successfully.';
END $$;
