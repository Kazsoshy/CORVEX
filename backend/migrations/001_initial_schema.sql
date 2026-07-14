-- ============================================================
-- CORVEX Furniture Retail — PostgreSQL Schema
-- Migration: 001_initial_schema.sql
-- Description: Full database schema with RBAC, inventory,
--              collections, sales, audit trail.
-- ============================================================

-- ------------------------------------------------------------
-- EXTENSIONS
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1. ROLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    slug        VARCHAR(50)  NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. PERMISSIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(50)  NOT NULL UNIQUE,   -- e.g. 'view', 'create', 'delete'
    label       VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. ROLE_PERMISSIONS  (RBAC junction)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
    id            SERIAL PRIMARY KEY,
    role_id       INT          NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id INT          NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (role_id, permission_id)
);

-- ------------------------------------------------------------
-- 4. BRANCHES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    city        VARCHAR(100) NOT NULL,
    region      VARCHAR(100),
    address     TEXT,
    phone       VARCHAR(100),
    email       VARCHAR(100),
    manager     VARCHAR(100),
    status      VARCHAR(20)  NOT NULL DEFAULT 'Active'
                             CHECK (status IN ('Active','Inactive')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 5. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(120) NOT NULL,
    username        VARCHAR(60)  NOT NULL UNIQUE,
    email           VARCHAR(120) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role_id         INT          NOT NULL REFERENCES roles(id),
    branch_id       INT          REFERENCES branches(id),
    contact_number  VARCHAR(100),
    address         TEXT,
    employee_id     VARCHAR(100)  UNIQUE,
    avatar_initials VARCHAR(4),
    status          VARCHAR(20)  NOT NULL DEFAULT 'Active'
                                 CHECK (status IN ('Active','Inactive','Suspended')),
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id   ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_status    ON users(status);

-- ------------------------------------------------------------
-- 6. CLIENTS  (extended customer/client records)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id                  SERIAL PRIMARY KEY,
    user_id             INT          REFERENCES users(id) ON DELETE SET NULL,
    account_number      VARCHAR(100)  NOT NULL UNIQUE,
    client_name         VARCHAR(150) NOT NULL,
    business_name       VARCHAR(150),
    business_type       VARCHAR(100),
    contact_person      VARCHAR(120),
    phone               VARCHAR(100),
    email               VARCHAR(120),
    address             TEXT,
    branch_id           INT          REFERENCES branches(id),
    credit_limit        NUMERIC(12,2) NOT NULL DEFAULT 0,
    outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    status              VARCHAR(20)  NOT NULL DEFAULT 'Active'
                                     CHECK (status IN ('Active','Overdue','Blacklisted','Pending','Current','Inactive')),
    days_overdue        INT          NOT NULL DEFAULT 0,
    risk_level          VARCHAR(20)  CHECK (risk_level IN ('Low','Medium','High','Critical')),
    blacklisted         BOOLEAN      NOT NULL DEFAULT FALSE,
    total_purchases     NUMERIC(14,2) NOT NULL DEFAULT 0,
    assigned_collector  INT          REFERENCES users(id),
    account_open_date   DATE,
    last_visit_date     DATE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_branch_id  ON clients(branch_id);
CREATE INDEX IF NOT EXISTS idx_clients_status      ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_acc_number  ON clients(account_number);

-- ------------------------------------------------------------
-- 7. SUPPLIERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL UNIQUE,
    contact     VARCHAR(120),
    phone       VARCHAR(100),
    email       VARCHAR(120),
    address     TEXT,
    status      VARCHAR(20)  NOT NULL DEFAULT 'Active'
                             CHECK (status IN ('Active','Inactive')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. PRODUCTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    sku         VARCHAR(50)  NOT NULL UNIQUE,
    category    VARCHAR(80),
    description TEXT,
    unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit_type   VARCHAR(100)  NOT NULL DEFAULT 'Unit',
    barcode     VARCHAR(50),
    supplier_id INT          REFERENCES suppliers(id),
    reorder_point INT        NOT NULL DEFAULT 5,
    status      VARCHAR(20)  NOT NULL DEFAULT 'Active'
                             CHECK (status IN ('Active','Discontinued')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_sku      ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ------------------------------------------------------------
-- 9. INVENTORY  (stock per product per branch)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
    id              SERIAL PRIMARY KEY,
    product_id      INT          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id       INT          NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity        INT          NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    stock_status    VARCHAR(100)  NOT NULL DEFAULT 'Sufficient'
                                 CHECK (stock_status IN ('Sufficient','Low Stock','Critical Stock','Out of Stock')),
    last_updated    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id  ON inventory(branch_id);

-- ------------------------------------------------------------
-- 10. STOCK_MOVEMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
    id          SERIAL PRIMARY KEY,
    movement_ref VARCHAR(100) NOT NULL UNIQUE,
    product_id  INT          NOT NULL REFERENCES products(id),
    branch_id   INT          NOT NULL REFERENCES branches(id),
    quantity    INT          NOT NULL,        -- positive = in, negative = out
    type        VARCHAR(50)  NOT NULL
                CHECK (type IN ('Sale Deduction','Restock','Transfer In','Transfer Out','Stock Count Adjustment','Damage Write-Off')),
    notes       TEXT,
    performed_by INT         REFERENCES users(id),
    movement_date DATE       NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_id  ON stock_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date       ON stock_movements(movement_date);

-- ------------------------------------------------------------
-- 11. TRANSFERS  (inter-branch transfer requests)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transfers (
    id                  SERIAL PRIMARY KEY,
    transfer_ref        VARCHAR(100)  NOT NULL UNIQUE,
    product_id          INT          NOT NULL REFERENCES products(id),
    quantity            INT          NOT NULL CHECK (quantity > 0),
    source_branch_id    INT          NOT NULL REFERENCES branches(id),
    destination_branch_id INT        NOT NULL REFERENCES branches(id),
    status              VARCHAR(100)  NOT NULL DEFAULT 'Pending Approval'
                                     CHECK (status IN ('Pending Approval','Submitted','Approved','Completed','Rejected')),
    submitted_by        INT          NOT NULL REFERENCES users(id),
    approved_by         INT          REFERENCES users(id),
    approval_info       TEXT,
    notes               TEXT,
    submitted_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
    completed_date      DATE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfers_product_id  ON transfers(product_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status       ON transfers(status);

-- ------------------------------------------------------------
-- 12. RESTOCK_RECORDS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restock_records (
    id              SERIAL PRIMARY KEY,
    restock_ref     VARCHAR(100)  NOT NULL UNIQUE,
    product_id      INT          NOT NULL REFERENCES products(id),
    supplier_id     INT          REFERENCES suppliers(id),
    branch_id       INT          NOT NULL REFERENCES branches(id),
    quantity        INT          NOT NULL CHECK (quantity > 0),
    delivery_ref    VARCHAR(50),
    date_received   DATE         NOT NULL,
    received_by     INT          REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 13. COLLECTION_PAYMENTS  (payments collected in the field)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_payments (
    id              SERIAL PRIMARY KEY,
    receipt_number  VARCHAR(100)  NOT NULL UNIQUE,
    client_id       INT          NOT NULL REFERENCES clients(id),
    collector_id    INT          NOT NULL REFERENCES users(id),
    branch_id       INT          REFERENCES branches(id),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method  VARCHAR(100)  NOT NULL DEFAULT 'Cash'
                                 CHECK (payment_method IN ('Cash','Check','Bank Transfer','GCash','Maya')),
    payment_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
    payment_time    TIME,
    status          VARCHAR(100)  NOT NULL DEFAULT 'Confirmed'
                                 CHECK (status IN ('Confirmed','Pending Review','Reversed')),
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_payments_client_id    ON collection_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_collection_payments_collector_id ON collection_payments(collector_id);
CREATE INDEX IF NOT EXISTS idx_collection_payments_date         ON collection_payments(payment_date);

-- ------------------------------------------------------------
-- 14. SALES_INVOICES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_invoices (
    id              SERIAL PRIMARY KEY,
    invoice_number  VARCHAR(100)  NOT NULL UNIQUE,
    client_id       INT          NOT NULL REFERENCES clients(id),
    sales_agent_id  INT          NOT NULL REFERENCES users(id),
    branch_id       INT          NOT NULL REFERENCES branches(id),
    total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_method  VARCHAR(100)  DEFAULT 'Cash'
                                 CHECK (payment_method IN ('Cash','Check','Bank Transfer','GCash','Maya','Credit')),
    status          VARCHAR(100)  NOT NULL DEFAULT 'Confirmed'
                                 CHECK (status IN ('Draft','Confirmed','Pending Review','Cancelled')),
    invoice_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_client_id      ON sales_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_sales_agent_id ON sales_invoices(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_date           ON sales_invoices(invoice_date);

-- ------------------------------------------------------------
-- 15. SALES_INVOICE_ITEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id              SERIAL PRIMARY KEY,
    invoice_id      INT          NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id      INT          NOT NULL REFERENCES products(id),
    quantity        INT          NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(12,2) NOT NULL,
    line_total      NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id  ON sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id  ON sales_invoice_items(product_id);

-- ------------------------------------------------------------
-- 16. AUDIT_LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INT          REFERENCES users(id),
    user_name   VARCHAR(120),
    action      VARCHAR(100) NOT NULL,
    module      VARCHAR(80),
    ip_address  VARCHAR(50),
    status      VARCHAR(20)  NOT NULL DEFAULT 'Success'
                             CHECK (status IN ('Success','Failed','Warning')),
    details     TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status     ON audit_logs(status);

-- ------------------------------------------------------------
-- 17. NOTIFICATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INT          REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50),
    title       VARCHAR(200) NOT NULL,
    message     TEXT         NOT NULL,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    related_to  VARCHAR(200),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read   ON notifications(is_read);

-- ------------------------------------------------------------
-- Auto-update updated_at trigger function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['roles','permissions','role_permissions','branches','users','clients','suppliers','products','transfers'] LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
            CREATE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
