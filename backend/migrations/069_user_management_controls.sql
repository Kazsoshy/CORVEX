-- 069: Operating Manager user management controls
--  * Structured, immutable Employee ID (EMP-00001) for employee accounts (customers excluded)
--  * Case-insensitive email uniqueness
--  * Forced password change, admin session revocation, status change metadata
--  * Align Branch Manager branch assignments with branches.manager_id (one active BM per branch)
--  * Seed user lifecycle policy (inactivity deactivation off by default)

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_revoked_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_changed_by INTEGER NULL REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason TEXT NULL;

-- Emails are compared case-insensitively everywhere; store them normalized.
UPDATE users u
   SET email = LOWER(TRIM(u.email))
 WHERE u.email <> LOWER(TRIM(u.email))
   AND NOT EXISTS (
     SELECT 1 FROM users o WHERE o.id <> u.id AND LOWER(TRIM(o.email)) = LOWER(TRIM(u.email))
   );
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (LOWER(email));

CREATE SEQUENCE IF NOT EXISTS users_employee_seq START 1;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT u.id
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
     WHERE u.employee_id IS NULL
       AND r.slug NOT IN ('customer', 'client')
     ORDER BY u.created_at, u.id
  LOOP
    UPDATE users
       SET employee_id = 'EMP-' || LPAD(nextval('users_employee_seq')::TEXT, 5, '0')
     WHERE id = rec.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_key ON users (employee_id) WHERE employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION users_employee_id_guard() RETURNS TRIGGER AS $$
DECLARE
  target_slug TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.employee_id IS NOT NULL THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
      RAISE EXCEPTION 'Employee ID % cannot be changed.', OLD.employee_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.employee_id IS NULL THEN
    SELECT slug INTO target_slug FROM roles WHERE role_id = NEW.role_id;
    IF target_slug IS NOT NULL AND target_slug NOT IN ('customer', 'client') THEN
      NEW.employee_id := 'EMP-' || LPAD(nextval('users_employee_seq')::TEXT, 5, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_employee_id ON users;
CREATE TRIGGER trg_users_employee_id
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_employee_id_guard();

-- branches.manager_id is the branch record of who manages it. Move an active Branch
-- Manager to the branch that names them when that branch has no active manager yet.
UPDATE users u
   SET branch_id = b.id,
       updated_at = NOW()
  FROM branches b, roles r
 WHERE b.manager_id = u.id
   AND r.role_id = u.role_id
   AND r.slug = 'branch_manager'
   AND u.status = 'Active'
   AND u.branch_id IS DISTINCT FROM b.id
   AND NOT EXISTS (
     SELECT 1
       FROM users o
       JOIN roles orr ON orr.role_id = o.role_id
      WHERE orr.slug = 'branch_manager'
        AND o.status = 'Active'
        AND o.branch_id = b.id
        AND o.id <> u.id
   );

INSERT INTO system_settings (setting_key, setting_value, updated_at)
VALUES (
  'user_policies',
  '{"inactivity":{"mode":"off","inactivityDays":null,"includeNeverSignedIn":false,"notifyOperatingManagers":true}}',
  CURRENT_TIMESTAMP
)
ON CONFLICT (setting_key) DO NOTHING;
