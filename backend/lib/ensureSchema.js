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
    CREATE TABLE IF NOT EXISTS stock_count_headers (
      count_id     SERIAL PRIMARY KEY,
      count_ref    VARCHAR(100) NOT NULL UNIQUE,
      branch_id    INTEGER NOT NULL REFERENCES branches(id),
      counted_by   INTEGER REFERENCES users(id),
      notes        TEXT,
      status       VARCHAR(30) NOT NULL DEFAULT 'Completed'
                   CHECK (status IN ('Completed')),
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

  await client.query(`
    ALTER TABLE field_activity_reports ALTER COLUMN visit_id DROP NOT NULL;
    ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS assignment_id INTEGER;
    ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS customer_id INTEGER;
  `);

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
}
