-- =====================================================================
-- CORVEX — Migration 027: Add middle_name to users
-- =====================================================================
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50) DEFAULT NULL;

COMMIT;
