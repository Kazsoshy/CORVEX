-- Field activity reports: photo evidence (required on new submissions via API)
BEGIN;

ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS photo TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_activity_reports'
      AND column_name = 'photo'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE field_activity_reports ALTER COLUMN photo TYPE TEXT;
  END IF;
END $$;

COMMIT;
