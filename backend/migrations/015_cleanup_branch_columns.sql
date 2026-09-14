-- ============================================================
-- CORVEX — Migration 015: Clean up duplicate branch columns
-- Removes the old contact_no and manager (text) columns that
-- were left over after 014 added phone and manager_id.
-- ============================================================

BEGIN;

-- Drop contact_no if phone already exists (rename happened via 000_prepare)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'contact_no'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'phone'
  ) THEN
    -- Copy any non-null contact_no values into phone if phone is empty
    UPDATE branches SET phone = contact_no WHERE (phone IS NULL OR phone = '') AND contact_no IS NOT NULL;
    ALTER TABLE branches DROP COLUMN contact_no;
  END IF;
END $$;

-- Drop manager (text) if manager_id (FK) already exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'manager'
      AND data_type IN ('character varying', 'text', 'varchar')
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'manager_id'
  ) THEN
    ALTER TABLE branches DROP COLUMN manager;
  END IF;
END $$;

COMMIT;
