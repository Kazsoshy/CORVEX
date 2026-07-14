-- Rename PKs to standard "id" if they exist under old names
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='user_id') THEN
    ALTER TABLE users RENAME COLUMN user_id TO id;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='branch_id') THEN
    ALTER TABLE branches RENAME COLUMN branch_id TO id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_id') THEN
    ALTER TABLE products RENAME COLUMN product_id TO id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='client_id') THEN
    ALTER TABLE clients RENAME COLUMN client_id TO id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='stock_movements_id') THEN
    ALTER TABLE stock_movements RENAME COLUMN stock_movements_id TO id;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='notification_id') THEN
    ALTER TABLE notifications RENAME COLUMN notification_id TO id;
  END IF;
END $$;

-- 1. USERS Table
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password') THEN
    ALTER TABLE users RENAME COLUMN password TO password_hash;
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_initials VARCHAR(4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Fix types for existing columns
ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255);
ALTER TABLE users ALTER COLUMN contact_number TYPE VARCHAR(100);
ALTER TABLE users ALTER COLUMN employee_id TYPE VARCHAR(100);

-- Drop NOT NULL on old columns so seed data works
DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN first_name DROP NOT NULL;
  ALTER TABLE users ALTER COLUMN last_name DROP NOT NULL;
  ALTER TABLE users ALTER COLUMN role DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Populate full_name from old first_name/last_name
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='first_name') THEN
    EXECUTE 'UPDATE users SET full_name = COALESCE(first_name, '''') || '' '' || COALESCE(last_name, '''') WHERE full_name IS NULL';
  END IF;
END $$;

-- Ensure no nulls/duplicates for users
UPDATE users SET email = 'old_user_' || id || '@corvex.ph' WHERE email IS NULL OR email = '';
UPDATE users SET username = 'old_user_' || id WHERE username IS NULL OR username = '';
UPDATE users SET email = email || '_' || id WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) as rnum FROM users) t WHERE t.rnum > 1);
UPDATE users SET username = username || '_' || id WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY username ORDER BY id) as rnum FROM users) t WHERE t.rnum > 1);

-- 2. BRANCHES Table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='branch_name') THEN
    ALTER TABLE branches RENAME COLUMN branch_name TO name;
  END IF;
END $$;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS email VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE branches ALTER COLUMN phone TYPE VARCHAR(100);

DO $$ BEGIN
  ALTER TABLE branches ALTER COLUMN address DROP NOT NULL;
  ALTER TABLE branches ALTER COLUMN city DROP NOT NULL;
  ALTER TABLE branches ALTER COLUMN latitude DROP NOT NULL;
  ALTER TABLE branches ALTER COLUMN longitude DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

UPDATE branches SET name = 'Old Branch ' || id WHERE name IS NULL OR name = '';
UPDATE branches SET name = name || '_' || id WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) as rnum FROM branches) t WHERE t.rnum > 1);

-- 3. PRODUCTS Table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_name') THEN
    ALTER TABLE products RENAME COLUMN product_name TO name;
  END IF;
END $$;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_type VARCHAR(100) DEFAULT 'Unit';
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point INT DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE products ALTER COLUMN unit_type TYPE VARCHAR(100);
ALTER TABLE products ALTER COLUMN sku TYPE VARCHAR(100);

DO $$ BEGIN
  ALTER TABLE products ALTER COLUMN category DROP NOT NULL;
  ALTER TABLE products ALTER COLUMN unit_price DROP NOT NULL;
  ALTER TABLE products ALTER COLUMN status DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

UPDATE products SET sku = 'OLD-SKU-' || id WHERE sku IS NULL OR sku = '';
UPDATE products SET sku = sku || '_' || id WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY sku ORDER BY id) as rnum FROM products) t WHERE t.rnum > 1);

-- 4. CLIENTS Table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id INT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_name VARCHAR(150);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_type VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person VARCHAR(120);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email VARCHAR(120);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS days_overdue INT DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS blacklisted BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_purchases NUMERIC(14,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS assigned_collector INT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_open_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_visit_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE clients ALTER COLUMN account_number TYPE VARCHAR(100);
ALTER TABLE clients ALTER COLUMN phone TYPE VARCHAR(100);

DO $$ BEGIN
  ALTER TABLE clients ALTER COLUMN business_name DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN first_name DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN last_name DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN address DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN latitude DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN longitude DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN outstanding_balance DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN purchase_volume DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN last_collection_date DROP NOT NULL;
  ALTER TABLE clients ALTER COLUMN last_sales_visit DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='first_name') THEN
    EXECUTE 'UPDATE clients SET client_name = COALESCE(business_name, COALESCE(first_name, '''') || '' '' || COALESCE(last_name, '''')) WHERE client_name IS NULL';
  END IF;
END $$;

UPDATE clients SET account_number = 'OLD-ACC-' || id WHERE account_number IS NULL OR account_number = '';
UPDATE clients SET account_number = account_number || '_' || id WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY account_number ORDER BY id) as rnum FROM clients) t WHERE t.rnum > 1);

-- 5. STOCK_MOVEMENTS Table
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS movement_ref VARCHAR(100);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS performed_by INT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS movement_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE stock_movements ALTER COLUMN movement_ref TYPE VARCHAR(100);
ALTER TABLE stock_movements ALTER COLUMN type TYPE VARCHAR(100);

DO $$ BEGIN
  ALTER TABLE stock_movements ALTER COLUMN type DROP NOT NULL;
  ALTER TABLE stock_movements ALTER COLUMN notes DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

UPDATE stock_movements SET movement_ref = 'OLD-MOV-' || id WHERE movement_ref IS NULL OR movement_ref = '';
UPDATE stock_movements SET movement_ref = movement_ref || '_' || id WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY movement_ref ORDER BY id) as rnum FROM stock_movements) t WHERE t.rnum > 1);

-- Add UNIQUE constraints that seed data relies on
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='users_email_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='users_username_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='branches_name_key') THEN
    ALTER TABLE branches ADD CONSTRAINT branches_name_key UNIQUE (name);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='products_sku_key') THEN
    ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='clients_account_number_key') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_account_number_key UNIQUE (account_number);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='stock_movements_movement_ref_key') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_ref_key UNIQUE (movement_ref);
  END IF;
END $$;
