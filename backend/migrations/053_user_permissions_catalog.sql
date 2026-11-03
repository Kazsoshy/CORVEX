-- ============================================================
-- CORVEX — Per-user permissions + Super Admin module catalog
-- Migration: 053_user_permissions_catalog.sql
-- ============================================================

BEGIN;

-- Structured catalog fields (module + machine-readable code)
ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS module VARCHAR(80),
  ADD COLUMN IF NOT EXISTS code VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS uq_permissions_code
  ON permissions (code)
  WHERE code IS NOT NULL;

-- Per-user permission overrides / explicit grants
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
  granted       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user
  ON user_permissions (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_permissions_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_permissions_updated_at
      BEFORE UPDATE ON user_permissions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    -- set_updated_at may be named differently on legacy DBs; ignore trigger if missing
    NULL;
END $$;

-- Seed Super Admin console module permissions (idempotent by code)
INSERT INTO permissions (label, description, module, code, status)
SELECT v.label, v.description, v.module, v.code, 'Active'
FROM (VALUES
  ('View Dashboard', 'Ability to view the Super Admin system dashboard', 'Dashboard', 'dashboard.view'),

  ('View Users', 'Ability to view the user directory', 'Users', 'users.view'),
  ('Create User', 'Ability to create new user accounts', 'Users', 'users.create'),
  ('Edit User', 'Ability to edit existing user accounts', 'Users', 'users.edit'),
  ('Disable User', 'Ability to disable (soft-delete) user accounts', 'Users', 'users.disable'),
  ('Activate/Deactivate User', 'Ability to change a user account Active/Inactive status', 'Users', 'users.activate'),

  ('View Roles', 'Ability to view roles and the permissions matrix', 'Role & Permissions', 'roles.view'),
  ('Create Role', 'Ability to create roles', 'Role & Permissions', 'roles.create'),
  ('Edit Role', 'Ability to edit roles', 'Role & Permissions', 'roles.edit'),
  ('Archive Role', 'Ability to archive roles', 'Role & Permissions', 'roles.delete'),
  ('Assign Permissions', 'Ability to assign module permissions to users or roles', 'Role & Permissions', 'roles.assign'),

  ('View System Settings', 'Ability to view company and system settings', 'System Settings', 'settings.view'),
  ('Update System Settings', 'Ability to update or reset system settings', 'System Settings', 'settings.update'),

  ('View Backups', 'Ability to view backup history', 'Backup & Restore', 'backup.view'),
  ('Create Backup', 'Ability to create a manual system backup', 'Backup & Restore', 'backup.create'),
  ('Restore Backup', 'Ability to restore settings from a backup', 'Backup & Restore', 'backup.restore'),
  ('Download Backup', 'Ability to download a backup file', 'Backup & Restore', 'backup.download'),

  ('View Database Monitoring', 'Ability to view database and server monitoring', 'Database Monitoring', 'monitoring.view'),
  ('Access Monitoring Details', 'Ability to refresh and inspect monitoring details', 'Database Monitoring', 'monitoring.details'),

  ('View Security Monitoring', 'Ability to view the security monitoring dashboard', 'Security Monitoring', 'security.view'),
  ('View Security Events', 'Ability to view security events', 'Security Monitoring', 'security.events'),
  ('Manage Security Settings', 'Ability to update security event status and run sweeps', 'Security Monitoring', 'security.manage'),

  ('View Audit Logs', 'Ability to view system audit logs', 'Audit Logs', 'audit.view'),
  ('View Audit Details', 'Ability to open full audit log detail records', 'Audit Logs', 'audit.details'),

  ('View Notifications', 'Ability to view the notifications inbox', 'Notifications', 'notifications.view'),
  ('Manage Notifications', 'Ability to mark notifications as read', 'Notifications', 'notifications.manage')
) AS v(label, description, module, code)
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p WHERE p.code = v.code
);

-- Grant all catalog permissions to Super Admin role
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.role_id, p.permission_id, TRUE
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
  AND p.code IS NOT NULL
  AND COALESCE(p.status, 'Active') = 'Active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET granted = TRUE, updated_at = NOW();

-- Operating Manager: Super Admin modules except role assignment and destructive system ops
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.role_id, p.permission_id,
  CASE
    WHEN p.code IN (
      'roles.create', 'roles.edit', 'roles.delete', 'roles.assign',
      'settings.update',
      'backup.create', 'backup.restore', 'backup.download',
      'security.manage'
    ) THEN FALSE
    ELSE TRUE
  END
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'operating_manager'
  AND p.code IS NOT NULL
  AND COALESCE(p.status, 'Active') = 'Active'
ON CONFLICT (role_id, permission_id) DO UPDATE
  SET granted = EXCLUDED.granted, updated_at = NOW();

COMMIT;
