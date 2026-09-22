-- ============================================================
-- CORVEX Database Seed Data — New Schema
-- Migration: 002_seed_data.sql
-- Target: PostgreSQL 13+, database name: corvex
-- ============================================================

BEGIN;

-- ============================================================
-- ROLES
-- ============================================================
INSERT INTO roles (role_name, slug) VALUES
('Super Admin', 'super_admin'),
('Operating Manager', 'operating_manager'),
('Branch Manager', 'branch_manager'),
('Inventory Staff', 'inventory_staff'),
('Sales Staff', 'sales_staff'),
('Collector', 'collector'),
('Customer', 'customer');

-- ============================================================
-- PERMISSIONS
-- ============================================================
INSERT INTO permissions (label, description) VALUES
('View Dashboard', 'Ability to view dashboard'),
('Manage Users', 'Ability to create, edit, and delete users'),
('Manage Roles', 'Ability to manage role permissions'),
('Manage Branches', 'Ability to manage branch information'),
('View Inventory', 'Ability to view inventory levels'),
('Manage Inventory', 'Ability to update inventory and process restocks'),
('View Sales', 'Ability to view sales data'),
('Create Sales', 'Ability to create sales invoices'),
('View Collections', 'Ability to view collection data'),
('Process Collections', 'Ability to process payment collections'),
('View Reports', 'Ability to view system reports'),
('Manage System', 'Ability to manage system settings');

-- ============================================================
-- ROLE_PERMISSIONS (Basic RBAC setup)
-- ============================================================
-- Super Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id 
FROM roles r, permissions p 
WHERE r.slug = 'super_admin';

-- Operating Manager gets most permissions except system management
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.role_id, p.permission_id, 
       CASE WHEN p.label = 'Manage System' THEN FALSE ELSE TRUE END
FROM roles r, permissions p 
WHERE r.slug = 'operating_manager';

-- Branch Manager gets branch-specific permissions
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.role_id, p.permission_id,
       CASE WHEN p.label IN ('Manage Users', 'Manage Roles', 'Manage System') THEN FALSE ELSE TRUE END
FROM roles r, permissions p 
WHERE r.slug = 'branch_manager';

-- ============================================================
-- BRANCHES
-- ============================================================
INSERT INTO branches (branch_name, address, latitude, longitude, phone, email, status) VALUES
('Davao City Branch', '88 MacArthur Highway, Davao City', 7.0731, 125.6128, '(082) 221-4488', 'davao@corvex.ph', 'Active'),
('General Santos Branch', '12 Magsaysay Ave, General Santos City', 6.1164, 125.1756, '(083) 552-8800', 'gensan@corvex.ph', 'Active'),
('Davao Oriental Branch', '5 Dahican Road, Mati City, Davao Oriental', 6.9564, 126.2219, '(087) 388-1122', 'davoriental@corvex.ph', 'Active');

-- ============================================================
-- USERS
-- ============================================================
-- Shared development password hash for seeded accounts.
-- Hash: $2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm

-- Super Admin (no branch — org-level role)
INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    NULL,
    'Corazon', 'Villanueva',
    (SELECT role_id FROM roles WHERE slug = 'super_admin'),
    'corazon.v@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

-- Operating Manager (no branch — oversees all branches)
INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    NULL,
    'Elena', 'Mercado',
    (SELECT role_id FROM roles WHERE slug = 'operating_manager'),
    'elena.mercado@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

-- Branch Managers
INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    'Roberto', 'Villanueva',
    (SELECT role_id FROM roles WHERE slug = 'branch_manager'),
    'roberto.villanueva@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'General Santos Branch'),
    'Miguel', 'Flores',
    (SELECT role_id FROM roles WHERE slug = 'branch_manager'),
    'miguel.f@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao Oriental Branch'),
    'Grace', 'Tan',
    (SELECT role_id FROM roles WHERE slug = 'branch_manager'),
    'grace.t@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

-- Inventory Staff
INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao Oriental Branch'),
    'Ana', 'Reyes',
    (SELECT role_id FROM roles WHERE slug = 'inventory_staff'),
    'ana.r@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

-- Sales Staff
INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    'Jane', 'Smith',
    (SELECT role_id FROM roles WHERE slug = 'sales_staff'),
    'jane.s@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'General Santos Branch'),
    'Robert', 'Lee',
    (SELECT role_id FROM roles WHERE slug = 'sales_staff'),
    'robert.l@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao Oriental Branch'),
    'Patricia', 'Cruz',
    (SELECT role_id FROM roles WHERE slug = 'sales_staff'),
    'patricia.c@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

-- Collectors
INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    'Maria', 'Dela Cruz',
    (SELECT role_id FROM roles WHERE slug = 'collector'),
    'maria.dc@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    'John', 'Dela Cruz',
    (SELECT role_id FROM roles WHERE slug = 'collector'),
    'john.dc@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    'Pedro', 'Garcia',
    (SELECT role_id FROM roles WHERE slug = 'collector'),
    'pedro.g@corvex.ph',
    '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    'Active';

-- ============================================================
-- PRODUCT CATEGORIES
-- ============================================================
INSERT INTO product_categories (category_name, status) VALUES
('Living Room', 'Active'),
('Bedroom', 'Active'),
('Dining Room', 'Active'),
('Office Furniture', 'Active'),
('Outdoor Furniture', 'Active'),
('Mattresses', 'Active'),
('Accessories', 'Active');

-- ============================================================
-- PRODUCTS
-- ============================================================
INSERT INTO products (product_name, category_id, unit_price, status) VALUES
('Sofa Set 3-Seater', 
 (SELECT category_id FROM product_categories WHERE category_name = 'Living Room'), 24999.00, 'Active'),
('Coffee Table', 
 (SELECT category_id FROM product_categories WHERE category_name = 'Living Room'), 8999.00, 'Active'),
('Queen Bed Frame', 
 (SELECT category_id FROM product_categories WHERE category_name = 'Bedroom'), 18999.00, 'Active'),
('Dining Table 6-Seater', 
 (SELECT category_id FROM product_categories WHERE category_name = 'Dining Room'), 32999.00, 'Active'),
('Office Chair', 
 (SELECT category_id FROM product_categories WHERE category_name = 'Office Furniture'), 5999.00, 'Active'),
('Garden Bench', 
 (SELECT category_id FROM product_categories WHERE category_name = 'Outdoor Furniture'), 7999.00, 'Active'),
('Mattress Queen', 
 (SELECT category_id FROM product_categories WHERE category_name = 'Mattresses'), 12999.00, 'Active');

-- ============================================================
-- SUPPLIERS
-- ============================================================
INSERT INTO suppliers (supplier_name, contact, email, address, status) VALUES
('Furniture Philippines Inc', '+63 2 8123 4567', 'sales@furnitureph.com', '123 Industrial Ave, Manila', 'Active'),
('Woodcraft Suppliers', '+63 2 8765 4321', 'info@woodcraft.com', '456 Timber Road, Cebu', 'Active'),
('Comfort Foam Manufacturing', '+63 2 8999 8888', 'orders@comfortfoam.com', '789 Foam Street, Davao', 'Active');

-- ============================================================
-- PAYMENT METHODS
-- ============================================================
INSERT INTO payment_methods (method_name, status) VALUES
('Cash', 'Active'),
('Check', 'Active'),
('Bank Transfer', 'Active'),
('GCash', 'Active'),
('Maya', 'Active'),
('Credit', 'Active');

-- ============================================================
-- SAMPLE CUSTOMERS
-- ============================================================
INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude, 
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    'Rafael', 'Lim',
    '123 Rizal Street, Davao City',
    7.0731, 125.6128,
    '+63 917 123 4567',
    'Rafael', 'Lim',
    '+63 917 123 4567',
    'Active';

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude, 
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'General Santos Branch'),
    'Lorna', 'Mendoza',
    '456 Magsaysay Ave, General Santos City',
    6.1164, 125.1756,
    '+63 918 234 5678',
    'Lorna', 'Mendoza',
    '+63 918 234 5678',
    'Active';

-- ============================================================
-- CUSTOMER ACTIVITY & CREDIT INFO
-- ============================================================
INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume)
SELECT customer_id, 15000.00, 45000.00 FROM customers WHERE last_name = 'Lim';

INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume)
SELECT customer_id, 22000.00, 68000.00 FROM customers WHERE last_name = 'Mendoza';

INSERT INTO customer_credit_info (customer_id, credit_limit, monthly_income, credit_score, approved_by)
SELECT customer_id, 50000.00, 25000.00, 750, 
       (SELECT user_id FROM users WHERE email = 'elena.mercado@corvex.ph')
FROM customers WHERE last_name = 'Lim';

INSERT INTO customer_credit_info (customer_id, credit_limit, monthly_income, credit_score, approved_by)
SELECT customer_id, 75000.00, 35000.00, 800,
       (SELECT user_id FROM users WHERE email = 'elena.mercado@corvex.ph')
FROM customers WHERE last_name = 'Mendoza';

-- ============================================================
-- BRANCH INVENTORY
-- ============================================================
-- Davao City Branch inventory
INSERT INTO branch_inventory (branch_id, product_id, available_stock, reorder_level)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    product_id, 15, 5
FROM products;

-- General Santos Branch inventory
INSERT INTO branch_inventory (branch_id, product_id, available_stock, reorder_level)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'General Santos Branch'),
    product_id, 10, 3
FROM products;

-- Davao Oriental Branch inventory
INSERT INTO branch_inventory (branch_id, product_id, available_stock, reorder_level)
SELECT 
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao Oriental Branch'),
    product_id, 8, 3
FROM products;

-- ============================================================
-- TERRITORIES
-- ============================================================
INSERT INTO territories (territory_name, branch_id, assigned_user, coverage_area)
SELECT 
    'Davao City North',
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    (SELECT user_id FROM users WHERE email = 'maria.dc@corvex.ph'),
    'Buhangin, Agdao, Poblacion Districts'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'maria.dc@corvex.ph');

INSERT INTO territories (territory_name, branch_id, assigned_user, coverage_area)
SELECT 
    'Davao City South',
    (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
    (SELECT user_id FROM users WHERE email = 'john.dc@corvex.ph'),
    'Talomo, Toril, Bago Districts'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'john.dc@corvex.ph');

COMMIT;
