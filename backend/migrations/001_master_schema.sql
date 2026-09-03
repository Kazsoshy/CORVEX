BEGIN;

-- Helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ROLES & PERMISSIONS
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE role_credentials (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL UNIQUE REFERENCES roles(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_role_credentials_updated_at BEFORE UPDATE ON role_credentials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- BRANCHES
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    region VARCHAR(100),
    address VARCHAR(150),
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    phone VARCHAR(100),
    email VARCHAR(100),
    manager VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- USERS (Identity Base)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    role_id INTEGER NOT NULL REFERENCES roles(id),
    username VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    contact_number VARCHAR(100),
    address TEXT,
    employee_id VARCHAR(100),
    avatar_initials VARCHAR(4),
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    last_login TIMESTAMPTZ,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- TERRITORIES
CREATE TABLE territories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    assigned_user INTEGER REFERENCES users(id),
    coverage_area TEXT NOT NULL
);

-- LOOKUPS
CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive'))
);

CREATE TABLE product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact VARCHAR(120) NOT NULL,
    email VARCHAR(120) NOT NULL,
    address TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PRODUCTS
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES product_categories(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    unit_price DECIMAL(10,2),
    unit_type VARCHAR(100) DEFAULT 'Unit',
    barcode VARCHAR(50),
    reorder_point INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- CUSTOMERS (Consolidated)
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    contact_person_fname VARCHAR(100),
    contact_person_lname VARCHAR(100),
    contact_person_phone VARCHAR(30),
    
    -- From customer_activity
    outstanding_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    purchase_volume DECIMAL(12,2) NOT NULL DEFAULT 0,
    last_collection_date DATE,
    last_sales_visit DATE,
    
    -- From customer_credit_info
    credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    monthly_income DECIMAL(12,2),
    employment_status VARCHAR(50),
    credit_score INTEGER,
    approved_by INTEGER REFERENCES users(id),
    approved_date DATE,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INVENTORY
CREATE TABLE branch_inventory (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    available_stock INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (branch_id, product_id)
);
CREATE TRIGGER trg_branch_inventory_updated_at BEFORE UPDATE ON branch_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE restock_records (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    delivery_ref VARCHAR(100) NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    quantity INTEGER NOT NULL,
    received_date DATE NOT NULL
);

CREATE TABLE transfers (
    id SERIAL PRIMARY KEY,
    transfer_ref VARCHAR(100) NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    source_branch_id INTEGER NOT NULL REFERENCES branches(id),
    destination_branch_id INTEGER NOT NULL REFERENCES branches(id),
    status VARCHAR(30) NOT NULL DEFAULT 'Pending Approval' CHECK (status IN ('Pending Approval', 'Submitted', 'Approved', 'Completed', 'Rejected')),
    submitted_by INTEGER NOT NULL REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    approval_info TEXT,
    submitted_date DATE NOT NULL,
    completed_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (source_branch_id <> destination_branch_id)
);
CREATE TRIGGER trg_transfers_updated_at BEFORE UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    performed_by INTEGER REFERENCES users(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    type VARCHAR(100),
    movement_ref VARCHAR(100) UNIQUE,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    movement_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SALES & INVOICES
CREATE TABLE sales_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id),
    sales_agent_id INTEGER REFERENCES users(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    total_amount DECIMAL(12,2) NOT NULL,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
    status VARCHAR(30) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Confirmed', 'Pending Review', 'Cancelled')),
    invoices_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_sales_invoices_updated_at BEFORE UPDATE ON sales_invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sales_invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- COLLECTIONS
CREATE TABLE collection_payment (
    id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id),
    collector_id INTEGER NOT NULL REFERENCES users(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    amount DECIMAL(12,2) NOT NULL,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
    payment_date DATE NOT NULL,
    payment_time TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Cancelled')),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_collection_payment_updated_at BEFORE UPDATE ON collection_payment FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE digital_receipts (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER NOT NULL REFERENCES collection_payment(id),
    receipt_number VARCHAR(25) NOT NULL UNIQUE,
    receipt_date TIMESTAMP NOT NULL,
    generated_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE credit_history (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    sales_id INTEGER REFERENCES sales_invoices(id),
    collection_id INTEGER REFERENCES collection_payment(id),
    previous_balance DECIMAL(10,2) NOT NULL,
    payment_amount DECIMAL(10,2) NOT NULL,
    remaining_balance DECIMAL(10,2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('Paid', 'Partial', 'Overdue')),
    transaction_date DATE NOT NULL
);

-- FIELD OPERATIONS
CREATE TABLE field_visits (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    visit_type VARCHAR(20) NOT NULL CHECK (visit_type IN ('Collection', 'Sales')),
    scheduled_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_field_visits_updated_at BEFORE UPDATE ON field_visits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE field_activity_reports (
    id SERIAL PRIMARY KEY,
    visit_id INTEGER NOT NULL REFERENCES field_visits(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    activity_type VARCHAR(50) NOT NULL,
    remarks TEXT,
    photo VARCHAR(255),
    sync_status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (sync_status IN ('Pending', 'Synced', 'Failed')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE offline_sync_queue (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    device_id VARCHAR(100),
    table_name VARCHAR(50) NOT NULL,
    record_reference VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (sync_status IN ('Pending', 'Synced', 'Failed')),
    attempted_at TIMESTAMP,
    synced_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE saw_results (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    engine_type VARCHAR(20) NOT NULL CHECK (engine_type IN ('Collection', 'Sales')),
    score DECIMAL(4,4) NOT NULL,
    ranking INTEGER NOT NULL,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SYSTEM
CREATE TABLE performance_summary (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    total_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_collections DECIMAL(12,2) NOT NULL DEFAULT 0,
    inventory_accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'Unread' CHECK (status IN ('Read', 'Unread')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    user_name VARCHAR(150) NOT NULL,
    action VARCHAR(150) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    status_details VARCHAR(150) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
