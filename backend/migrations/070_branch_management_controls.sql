-- 070: Branch Management controls
--  * Persistent Branch Code (BR-00001) — readable unique ID, not the PK (same concept as product SKU / EMP IDs)
--  * Structured PH address parts
--  * Operations state for formal suspension / cessation (recorded by authorized admins)
--  * Status-change metadata for policy-driven Active/Inactive
--  * Seed branch lifecycle policies (inactivity evaluation off by default)

ALTER TABLE branches ADD COLUMN IF NOT EXISTS branch_code VARCHAR(20);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address_street VARCHAR(150);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address_barangay VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address_city VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address_province VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address_zip VARCHAR(20);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS operations_state VARCHAR(20) NOT NULL DEFAULT 'operating';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS operations_reason TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS operations_recorded_at TIMESTAMPTZ;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS operations_recorded_by INTEGER REFERENCES users(id);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS status_changed_by INTEGER REFERENCES users(id);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS status_policy_key VARCHAR(40);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branches_operations_state_check'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT branches_operations_state_check
      CHECK (operations_state IN ('operating', 'suspended', 'ceased'));
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS branches_code_seq START 1;

DO $$
DECLARE
  rec RECORD;
  max_n INTEGER;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(branch_code FROM 4)::int), 0)
    INTO max_n
    FROM branches
   WHERE branch_code ~ '^BR-[0-9]+$';

  IF max_n > 0 THEN
    PERFORM setval('branches_code_seq', max_n, true);
  END IF;

  FOR rec IN
    SELECT id FROM branches WHERE branch_code IS NULL ORDER BY created_at, id
  LOOP
    UPDATE branches
       SET branch_code = 'BR-' || LPAD(nextval('branches_code_seq')::TEXT, 5, '0')
     WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE branches ALTER COLUMN branch_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branches_branch_code_key ON branches (branch_code);

CREATE OR REPLACE FUNCTION branches_branch_code_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.branch_code IS NOT NULL THEN
    IF NEW.branch_code IS DISTINCT FROM OLD.branch_code THEN
      RAISE EXCEPTION 'Branch Code % cannot be changed.', OLD.branch_code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.branch_code IS NULL OR BTRIM(NEW.branch_code) = '' THEN
    NEW.branch_code := 'BR-' || LPAD(nextval('branches_code_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branches_branch_code ON branches;
CREATE TRIGGER trg_branches_branch_code
  BEFORE INSERT OR UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION branches_branch_code_guard();

-- Backfill structured address when only the legacy free-text address / region exist.
UPDATE branches
   SET address_city = COALESCE(NULLIF(BTRIM(address_city), ''), NULLIF(BTRIM(region), ''))
 WHERE (address_city IS NULL OR BTRIM(address_city) = '')
   AND region IS NOT NULL
   AND BTRIM(region) <> '';

INSERT INTO system_settings (setting_key, setting_value, updated_at)
VALUES (
  'branch_policies',
  '{"inactivity":{"mode":"off","inactivityMonths":null,"reactivateOnActivity":true,"notifyOperatingManagers":true}}',
  CURRENT_TIMESTAMP
)
ON CONFLICT (setting_key) DO NOTHING;
