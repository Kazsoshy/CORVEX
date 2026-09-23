-- =====================================================================
-- CORVEX — Migration 029: Customer middle names & relationship cleanup
-- =====================================================================
BEGIN;

-- Account owner middle name (nullable, same pattern as users.middle_name)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50) DEFAULT NULL;

-- Contact person middle name (nullable)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person_mname VARCHAR(100) DEFAULT NULL;

-- Remove primary contact relationship (secondary keeps secondary_contact_relationship)
ALTER TABLE customers DROP COLUMN IF EXISTS contact_person_relationship;

COMMIT;
