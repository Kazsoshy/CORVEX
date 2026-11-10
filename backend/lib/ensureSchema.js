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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT NULL;

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
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_type VARCHAR(80);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_number VARCHAR(80);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_photo TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_verification_status VARCHAR(30) NOT NULL DEFAULT 'Unverified';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_region VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_province VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_city VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_barangay VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_street VARCHAR(150);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_zip VARCHAR(20);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS mothers_maiden_name VARCHAR(120);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS civil_status VARCHAR(30);
    ALTER TABLE customers ALTER COLUMN latitude DROP NOT NULL;

    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS request_reason VARCHAR(120);
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS requested_credit_limit DECIMAL(12, 2);
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS request_remarks TEXT;
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS financial_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20);
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS risk_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS approved_credit_limit DECIMAL(12, 2);
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS decision_remarks TEXT;
    ALTER TABLE credit_investigations ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP;
    ALTER TABLE customers ALTER COLUMN longitude DROP NOT NULL;

    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sales_invoices_id INTEGER;
    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS agent_reply TEXT;
    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
    ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS review_note TEXT;
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS pay_type VARCHAR(20) NOT NULL DEFAULT 'full';
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS down_payment DECIMAL(12, 2) NOT NULL DEFAULT 0;
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS term_months INTEGER;
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS monthly_amount DECIMAL(12, 2);
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS first_due_date DATE;
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

  // Warehouse document tables (also created by 051/052 migrations). Ensure on
  // boot so inventory routes do not 500 into empty Warehouse Staff screens.
  await client.query(`
    CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
      line_id     SERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL REFERENCES inventory_transfers(transfer_id) ON DELETE CASCADE,
      product_id  INTEGER NOT NULL REFERENCES products(id),
      quantity    INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE (transfer_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_transfer_lines_transfer_id
      ON inventory_transfer_lines (transfer_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_transfer_lines_product_id
      ON inventory_transfer_lines (product_id);

    CREATE TABLE IF NOT EXISTS restock_headers (
      restock_id    SERIAL PRIMARY KEY,
      restock_ref   VARCHAR(100) NOT NULL UNIQUE,
      branch_id     INTEGER NOT NULL REFERENCES branches(id),
      supplier_id   INTEGER NOT NULL REFERENCES suppliers(suppliers_id),
      delivery_ref  VARCHAR(100) NOT NULL,
      received_date DATE NOT NULL,
      recorded_by   INTEGER REFERENCES users(id),
      notes         TEXT,
      status        VARCHAR(30) NOT NULL DEFAULT 'Draft'
                    CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Posted', 'Rejected')),
      submitted_by  INTEGER REFERENCES users(id),
      submitted_at  TIMESTAMP,
      approved_by   INTEGER REFERENCES users(id),
      approved_at   TIMESTAMP,
      decision_remarks TEXT,
      posted_by     INTEGER REFERENCES users(id),
      posted_at     TIMESTAMP,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS restock_lines (
      line_id    SERIAL PRIMARY KEY,
      restock_id INTEGER NOT NULL REFERENCES restock_headers(restock_id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE (restock_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_restock_headers_branch_id ON restock_headers (branch_id);
    CREATE INDEX IF NOT EXISTS idx_restock_headers_supplier_id ON restock_headers (supplier_id);
    CREATE INDEX IF NOT EXISTS idx_restock_lines_restock_id ON restock_lines (restock_id);

    CREATE TABLE IF NOT EXISTS stock_count_headers (
      count_id     SERIAL PRIMARY KEY,
      count_ref    VARCHAR(100) NOT NULL UNIQUE,
      branch_id    INTEGER NOT NULL REFERENCES branches(id),
      counted_by   INTEGER REFERENCES users(id),
      notes        TEXT,
      status       VARCHAR(30) NOT NULL DEFAULT 'Completed'
                   CHECK (status IN ('Pending Approval', 'Completed', 'Rejected')),
      approved_by  INTEGER REFERENCES users(id),
      approved_at  TIMESTAMP,
      decision_remarks TEXT,
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stock_count_lines (
      line_id            SERIAL PRIMARY KEY,
      count_id           INTEGER NOT NULL REFERENCES stock_count_headers(count_id) ON DELETE CASCADE,
      product_id         INTEGER NOT NULL REFERENCES products(id),
      system_quantity    INTEGER NOT NULL,
      physical_quantity  INTEGER NOT NULL CHECK (physical_quantity >= 0),
      variance           INTEGER NOT NULL,
      notes              TEXT,
      UNIQUE (count_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_count_headers_branch_id ON stock_count_headers (branch_id);
    CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count_id ON stock_count_lines (count_id);
    CREATE INDEX IF NOT EXISTS idx_stock_count_lines_product_id ON stock_count_lines (product_id);
  `);

  // Soften legacy single-SKU transfer columns after document-lines model.
  await client.query(`
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS shipped_by INTEGER REFERENCES users(id);
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP;
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS received_by INTEGER REFERENCES users(id);
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS receive_notes TEXT;
  `);

  // Restock / stock-count approval columns for existing databases.
  await client.query(`
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Posted';
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id);
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS decision_remarks TEXT;
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS posted_by INTEGER REFERENCES users(id);
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP;
    ALTER TABLE restock_headers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE stock_count_headers ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
    ALTER TABLE stock_count_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
    ALTER TABLE stock_count_headers ADD COLUMN IF NOT EXISTS decision_remarks TEXT;
    ALTER TABLE stock_count_headers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);
  try {
    await client.query(`ALTER TABLE inventory_transfers ALTER COLUMN product_id DROP NOT NULL`);
  } catch {
    /* already nullable or constraint name differs */
  }
  try {
    await client.query(`ALTER TABLE inventory_transfers ALTER COLUMN quantity DROP NOT NULL`);
  } catch {
    /* already nullable or constraint name differs */
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
      line_id     SERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL REFERENCES inventory_transfers(transfer_id) ON DELETE CASCADE,
      product_id  INTEGER NOT NULL REFERENCES products(id),
      quantity    INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE (transfer_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_transfer_lines_transfer_id
      ON inventory_transfer_lines (transfer_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_transfer_lines_product_id
      ON inventory_transfer_lines (product_id);

    INSERT INTO inventory_transfer_lines (transfer_id, product_id, quantity)
    SELECT it.transfer_id, it.product_id, it.quantity
    FROM inventory_transfers it
    WHERE it.product_id IS NOT NULL
      AND it.quantity IS NOT NULL
      AND it.quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory_transfer_lines l WHERE l.transfer_id = it.transfer_id
      );

    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS notes TEXT;

    CREATE TABLE IF NOT EXISTS restock_headers (
      restock_id    SERIAL PRIMARY KEY,
      restock_ref   VARCHAR(100) NOT NULL UNIQUE,
      branch_id     INTEGER NOT NULL REFERENCES branches(id),
      supplier_id   INTEGER NOT NULL REFERENCES suppliers(suppliers_id),
      delivery_ref  VARCHAR(100) NOT NULL,
      received_date DATE NOT NULL,
      recorded_by   INTEGER REFERENCES users(id),
      notes         TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS restock_lines (
      line_id    SERIAL PRIMARY KEY,
      restock_id INTEGER NOT NULL REFERENCES restock_headers(restock_id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE (restock_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_restock_headers_branch_id ON restock_headers (branch_id);
    CREATE INDEX IF NOT EXISTS idx_restock_headers_supplier_id ON restock_headers (supplier_id);
    CREATE INDEX IF NOT EXISTS idx_restock_lines_restock_id ON restock_lines (restock_id);

    INSERT INTO restock_headers (restock_ref, branch_id, supplier_id, delivery_ref, received_date, recorded_by, notes, created_at)
    SELECT
      'RST-LEGACY-' || MIN(r.restock_id)::text,
      r.branch_id,
      r.supplier_id,
      r.delivery_ref,
      r.received_date,
      NULL,
      'Migrated from single-SKU restocks',
      CURRENT_TIMESTAMP
    FROM restocks r
    WHERE NOT EXISTS (
      SELECT 1
      FROM restock_headers h
      WHERE h.branch_id = r.branch_id
        AND h.supplier_id = r.supplier_id
        AND h.delivery_ref = r.delivery_ref
        AND h.received_date = r.received_date
    )
    GROUP BY r.branch_id, r.supplier_id, r.delivery_ref, r.received_date;

    INSERT INTO restock_lines (restock_id, product_id, quantity)
    SELECT h.restock_id, r.product_id, SUM(r.quantity)::int
    FROM restocks r
    JOIN restock_headers h
      ON h.branch_id = r.branch_id
     AND h.supplier_id = r.supplier_id
     AND h.delivery_ref = r.delivery_ref
     AND h.received_date = r.received_date
    WHERE NOT EXISTS (
      SELECT 1
      FROM restock_lines l
      WHERE l.restock_id = h.restock_id
        AND l.product_id = r.product_id
    )
    GROUP BY h.restock_id, r.product_id
    HAVING SUM(r.quantity) > 0;
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

  // Territories operational model (status, geometry, default personnel)
  try {
    await client.query(`
      ALTER TABLE territories
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active',
        ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
        ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
        ADD COLUMN IF NOT EXISTS radius_meters INTEGER NOT NULL DEFAULT 800,
        ADD COLUMN IF NOT EXISTS default_sales_agent_id INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS default_collector_id INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    try {
      await client.query(`ALTER TABLE territories ALTER COLUMN coverage_area DROP NOT NULL`);
    } catch {
      /* already nullable */
    }
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_territories_branch_status ON territories (branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_territories_default_sales_agent ON territories (default_sales_agent_id);
      CREATE INDEX IF NOT EXISTS idx_territories_default_collector ON territories (default_collector_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_territories_branch_name_active
        ON territories (branch_id, lower(btrim(territory_name)))
        WHERE status = 'Active'
    `);
  } catch (err) {
    console.error('[ensureSchema] territories operational columns:', err.message);
  }

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
    await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs (branch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_created ON audit_logs (branch_id, created_at DESC)`);
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

  await client.query(`
    ALTER TABLE field_activity_reports ALTER COLUMN visit_id DROP NOT NULL;
    ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS assignment_id INTEGER;
    ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS customer_id INTEGER;
    ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS severity VARCHAR(20);

    ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS visit_outcome VARCHAR(40);
    ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS visit_remarks TEXT;
    ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS visited_at TIMESTAMP;

    ALTER TABLE collection_payment ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);
  `);

  // One active Collection visit per customer per day (any collector).
  // Status CHECK only allows Pending|Completed, so this covers all live assignments.
  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_field_visits_collection_customer_day
      ON field_visits (customer_id, scheduled_date)
      WHERE visit_type = 'Collection'
    `);
  } catch (err) {
    console.error('[ensureSchema] field_visits unique day index:', err.message);
  }

  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_area_territory_day
      ON sales_area_assignments (territory_id, work_date)
      WHERE territory_id IS NOT NULL
        AND status IN ('Assigned', 'In Progress', 'Done')
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_area_agent_name_day
      ON sales_area_assignments (sales_agent_id, work_date, lower(btrim(area_name)))
      WHERE status IN ('Assigned', 'In Progress', 'Done')
    `);
  } catch (err) {
    console.error('[ensureSchema] sales_area_assignments unique indexes:', err.message);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS sales_area_assignments (
      assignment_id   SERIAL PRIMARY KEY,
      branch_id       INTEGER NOT NULL REFERENCES branches(id),
      sales_agent_id  INTEGER NOT NULL REFERENCES users(id),
      assigned_by     INTEGER REFERENCES users(id),
      territory_id    INTEGER REFERENCES territories(territory_id) ON DELETE SET NULL,
      area_name       VARCHAR(150) NOT NULL,
      coverage_notes  TEXT,
      work_date       DATE NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'Assigned'
                      CHECK (status IN ('Assigned', 'In Progress', 'Done')),
      latitude        DECIMAL(10, 7),
      longitude       DECIMAL(10, 7),
      radius_meters   INTEGER NOT NULL DEFAULT 800
                      CHECK (radius_meters >= 100 AND radius_meters <= 20000),
      started_at      TIMESTAMP,
      completed_at    TIMESTAMP,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_area_assignments_agent_date
      ON sales_area_assignments (sales_agent_id, work_date);
    CREATE TABLE IF NOT EXISTS sales_area_assignment_products (
      assignment_id INTEGER NOT NULL REFERENCES sales_area_assignments(assignment_id) ON DELETE CASCADE,
      product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      PRIMARY KEY (assignment_id, product_id)
    );
  `);

  await client.query(`
    ALTER TABLE credit_investigations
      ADD COLUMN IF NOT EXISTS revision_history_json JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE credit_investigations
      ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMP;
    ALTER TABLE credit_investigations
      ADD COLUMN IF NOT EXISTS resubmitted_by INTEGER REFERENCES users(id);

    CREATE TABLE IF NOT EXISTS credit_recommendations (
      recommendation_id   SERIAL PRIMARY KEY,
      customer_id         INTEGER NOT NULL REFERENCES customers(customer_id),
      branch_id           INTEGER NOT NULL REFERENCES branches(id),
      recommendation_type VARCHAR(40) NOT NULL,
      trigger_reason      TEXT NOT NULL,
      evidence_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
      risk_level          VARCHAR(20),
      risk_score          INTEGER,
      suggested_action    TEXT,
      status              VARCHAR(30) NOT NULL DEFAULT 'New'
                          CHECK (status IN ('New', 'Watching', 'Converted to CI', 'Dismissed')),
      converted_ci_id     INTEGER REFERENCES credit_investigations(ci_id) ON DELETE SET NULL,
      dismissed_reason    TEXT,
      dismissed_by        INTEGER REFERENCES users(id),
      dismissed_at        TIMESTAMP,
      generated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_evaluated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_credit_recommendations_branch_status
      ON credit_recommendations (branch_id, status);
    CREATE INDEX IF NOT EXISTS idx_credit_recommendations_customer
      ON credit_recommendations (customer_id, status);
  `);

  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_recommendations_open_type
      ON credit_recommendations (customer_id, recommendation_type)
      WHERE status IN ('New', 'Watching')
    `);
  } catch (err) {
    console.error('[ensureSchema] credit_recommendations unique index:', err.message);
  }

  await client.query(`
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS source_key VARCHAR(160);
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS entity_type VARCHAR(40);
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS entity_id INTEGER;
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS link_path VARCHAR(240);
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS resolution_note TEXT;
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS resolved_by INTEGER;
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;
    ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
  `);

  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_alerts_open_source_key
        ON operational_alerts (source_key)
        WHERE status = 'Open' AND source_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_operational_alerts_status ON operational_alerts (status);
      CREATE INDEX IF NOT EXISTS idx_operational_alerts_severity ON operational_alerts (severity);
      CREATE INDEX IF NOT EXISTS idx_operational_alerts_branch_status ON operational_alerts (branch_id, status);
    `);
  } catch (err) {
    console.error('[ensureSchema] operational_alerts indexes:', err.message);
  }
}
