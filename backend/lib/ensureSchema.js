/**
 * Applies lightweight schema fixes expected by API routes when migrations
 * have not been run yet. Safe to run on every startup (IF NOT EXISTS).
 */
export async function ensureSchema(client) {
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50) DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(120);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_file VARCHAR(80);

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50) DEFAULT NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person_mname VARCHAR(100) DEFAULT NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code VARCHAR(30);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person_relationship VARCHAR(80);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_fname VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_lname VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_phone VARCHAR(30);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_relationship VARCHAR(80);

    ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
    ALTER TABLE products ALTER COLUMN image_url TYPE TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(50);

    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(50);

    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module VARCHAR(80);
    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS code VARCHAR(100);
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';

    ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS photo TEXT;

    ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_email VARCHAR(150);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_status VARCHAR(30) NOT NULL DEFAULT 'none';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_sales_agent_id INTEGER;

    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sales_invoices_id INTEGER;
    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS agent_reply TEXT;
    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS review_note TEXT;
  `);

  await client.query(`
    DO $do$
    DECLARE
      cname text;
    BEGIN
      SELECT conname INTO cname
      FROM pg_constraint
      WHERE conrelid = 'stock_movements'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%Sale Deduction%'
        AND pg_get_constraintdef(oid) NOT ILIKE '%Sale Reversal%';
      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE stock_movements DROP CONSTRAINT %I', cname);
        ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
          CHECK (type IN (
            'Sale Deduction', 'Restock', 'Transfer In', 'Transfer Out',
            'Stock Count Adjustment', 'Damage Write-Off', 'Sale Reversal'
          ));
      END IF;
    END
    $do$;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_permissions_code
      ON permissions (code)
      WHERE code IS NOT NULL;
  `);

  await client.query(`
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
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_dedup (
      dedup_key  VARCHAR(160) PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS central_inventory (
      product_id      INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      total_quantity  INTEGER NOT NULL DEFAULT 0,
      branch_count    INTEGER NOT NULL DEFAULT 0,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Prevent duplicate inventory rows per branch+product (oversell / double-count risk).
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_inventory_branch_product
      ON branch_inventory (branch_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_branch_inventory_stock_status
      ON branch_inventory (stock_status);
    CREATE INDEX IF NOT EXISTS idx_branch_inventory_available
      ON branch_inventory (available_stock);
  `);

  await client.query(`
    INSERT INTO central_inventory (product_id, total_quantity, branch_count, updated_at)
    SELECT p.id,
           COALESCE(SUM(bi.available_stock), 0),
           COUNT(bi.inventory_id)::int,
           CURRENT_TIMESTAMP
    FROM products p
    LEFT JOIN branch_inventory bi ON bi.product_id = p.id
    GROUP BY p.id
    ON CONFLICT (product_id) DO UPDATE
      SET total_quantity = EXCLUDED.total_quantity,
          branch_count = EXCLUDED.branch_count,
          updated_at = CURRENT_TIMESTAMP
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS territory_assignments (
      assignment_id  SERIAL PRIMARY KEY,
      territory_id   INTEGER NOT NULL REFERENCES territories(territory_id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      role_id        INTEGER REFERENCES roles(role_id),
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(territory_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_territory_assignments_territory ON territory_assignments(territory_id);
    CREATE INDEX IF NOT EXISTS idx_territory_assignments_user ON territory_assignments(user_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key   VARCHAR(80) PRIMARY KEY,
      setting_value TEXT,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_backups (
      backup_id   SERIAL PRIMARY KEY,
      backup_type VARCHAR(30) NOT NULL DEFAULT 'Manual',
      status      VARCHAR(30) NOT NULL DEFAULT 'Completed',
      size_bytes  INTEGER,
      created_by  INTEGER REFERENCES users(id),
      file_name   VARCHAR(200) NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Supplier.contact stores phone numbers; replace name-only seed values.
  await client.query(`
    UPDATE suppliers
    SET contact = '09' || LPAD(((suppliers_id * 7919) % 1000000000)::text, 9, '0'),
        updated_at = NOW()
    WHERE contact IS NULL
       OR TRIM(contact) = ''
       OR contact !~ '[0-9]';
  `);

  // Audit log enrichment + login lockout fields (safe if migration 052 already applied).
  // Run as separate statements so one failure cannot skip the rest.
  try {
    await client.query(`ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL`);
    await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS role_name VARCHAR(100)`);
    await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module VARCHAR(100)`);
    await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS activity VARCHAR(150)`);
    await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50)`);
    await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS affected_record VARCHAR(200)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMP NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)`);
    await client.query(`
      UPDATE audit_logs
      SET
        module = COALESCE(module, 'Authentication'),
        activity = COALESCE(activity, action),
        description = COALESCE(description, status_details),
        status = COALESCE(
          status,
          CASE
            WHEN status_details ILIKE '%fail%' THEN 'Failed Login'
            WHEN status_details ILIKE '%success%' THEN 'Successful Login'
            WHEN action ILIKE '%lock%' THEN 'Account Locked'
            ELSE status_details
          END
        )
      WHERE module IS NULL
        AND (action ILIKE '%login%' OR status_details ILIKE '%login%')
    `);
  } catch (err) {
    console.error('[ensureSchema] audit enrichment:', err.message);
  }

  // Super Admin module permission catalog (idempotent by code).
  try {
    await client.query(`
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
      WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = v.code)
    `);

    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id, granted)
      SELECT r.role_id, p.permission_id, TRUE
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.slug = 'super_admin'
        AND p.code IS NOT NULL
        AND COALESCE(p.status, 'Active') = 'Active'
      ON CONFLICT (role_id, permission_id) DO UPDATE SET granted = TRUE, updated_at = NOW()
    `);
  } catch (err) {
    console.error('[ensureSchema] permission catalog:', err.message);
  }
}
