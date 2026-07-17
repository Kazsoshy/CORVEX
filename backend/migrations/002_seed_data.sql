-- ============================================================
-- CORVEX Furniture Retail — Seed Data
-- Migration: 002_seed_data.sql
-- Roles: Super Admin, Operating Manager, Inventory Staff,
--        Sales Staff, Collector, Client
-- Branches: Davao City, General Santos, Davao Oriental
-- All passwords are: Corvex@2026  (bcrypt hash below)
-- ============================================================

-- Password: Corvex@2026
-- Hash generated with bcrypt rounds=12
-- You may regenerate with: node -e "const b=require('bcryptjs');console.log(b.hashSync('Corvex@2026',12));"
-- Using a consistent hash for seed data:
DO $$
DECLARE
    hash_default TEXT := '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm';
BEGIN

-- ============================================================
-- ROLES
-- ============================================================
INSERT INTO roles (name, slug, description) VALUES
    ('Super Admin',       'super_admin',       'Full system control, infrastructure, and security management'),
    ('Operating Manager', 'operating_manager', 'Oversees all branches, approvals, KPIs, and operations'),
    ('Inventory Staff',   'inventory_staff',   'Manages warehouse stock, transfers, restocking, and inventory health'),
    ('Sales Staff',       'sales_staff',       'Handles client visits, sales orders, and territory management'),
    ('Collector',         'collector',         'Field agent responsible for payment collection and account visits'),
    ('Client',            'client',            'End customer with access to account balance, payments, and receipts')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- PERMISSIONS
-- ============================================================
INSERT INTO permissions (key, label, description) VALUES
    ('view',            'View',            'View records and reports'),
    ('create',          'Create',          'Create new records'),
    ('edit',            'Edit',            'Modify existing records'),
    ('delete',          'Delete',          'Delete records'),
    ('approve',         'Approve',         'Approve requests and workflows'),
    ('export',          'Export',          'Export reports to file formats'),
    ('manage_users',    'Manage Users',    'Create, edit, and deactivate user accounts'),
    ('manage_branches', 'Manage Branches', 'Create and configure branch settings')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROLE PERMISSIONS (RBAC Matrix)
-- ============================================================
-- Super Admin: ALL permissions
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Operating Manager: view, create, edit, approve, export, manage_users, manage_branches
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p
WHERE r.slug = 'operating_manager'
  AND p.key IN ('view','create','edit','approve','export','manage_users','manage_branches')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Inventory Staff: view, create, edit
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p
WHERE r.slug = 'inventory_staff'
  AND p.key IN ('view','create','edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Sales Staff: view, create
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p
WHERE r.slug = 'sales_staff'
  AND p.key IN ('view','create')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Collector: view, create
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p
WHERE r.slug = 'collector'
  AND p.key IN ('view','create')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Client: view only
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, TRUE
FROM roles r, permissions p
WHERE r.slug = 'client'
  AND p.key IN ('view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- BRANCHES
-- ============================================================
INSERT INTO branches (name, city, region, address, phone, email, manager, status) VALUES
    ('Davao City Branch',    'Davao City',    'Region XI',  '88 MacArthur Highway, Davao City',        '(082) 221-4488', 'davao@corvex.ph',    'Roberto Villanueva', 'Active'),
    ('General Santos Branch','General Santos','Region XII', '12 Magsaysay Ave, General Santos City',   '(083) 552-8800', 'gensan@corvex.ph',   'Miguel Flores',      'Active'),
    ('Davao Oriental Branch','Mati City',     'Region XI',  '5 Dahican Road, Mati City, Davao Oriental','(087) 388-1122', 'davoriental@corvex.ph', 'Grace Tan',       'Active')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SUPPLIERS
-- ============================================================
INSERT INTO suppliers (name, contact, phone, email, address) VALUES
    ('PhilFurniture Manufacturing', 'Ramon dela Torre',  '+63 2 8888-1234', 'orders@philfurniture.ph',    'Marilao, Bulacan'),
    ('Mindanao Wood Crafts',        'Crisanto Baguna',   '+63 82 296-5500', 'sales@mindanaowoodcraft.ph', 'Davao City'),
    ('ErgoCraft Philippines',       'Linda Sy',          '+63 32 411-7890', 'ergocraft@ph.net',           'Cebu City'),
    ('KabinetPro Davao',            'Bernardo Salinas',  '+63 82 228-4411', 'orders@kabinetpro.ph',       'Davao City'),
    ('Glasscraft Furniture',        'Analisa Torres',    '+63 32 344-5511', 'glass@gcfurniture.ph',       'Mandaue City'),
    ('Davao Rattan Exports',        'Eduardo Punzalan',  '+63 82 307-2200', 'rattan@davrex.ph',           'Davao City'),
    ('SleepWell PH',                'Norma Aquino',      '+63 2 8777-9090', 'sales@sleepwellph.com',      'Quezon City')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- USERS — Super Admins (2)
-- ============================================================
INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Marcus Santos',  'marcus.santos',  'marcus.santos@corvex.ph',  hash_default,
       r.id, NULL, '+63 917 555 0001', 'Davao City', 'SA-0001', 'MS', 'Active'
FROM roles r WHERE r.slug = 'super_admin'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Corazon Villanueva', 'corazon.v', 'corazon.v@corvex.ph', hash_default,
       r.id, NULL, '+63 917 555 0002', 'Cebu City', 'SA-0002', 'CV', 'Active'
FROM roles r WHERE r.slug = 'super_admin'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Rodrigo Natividad', 'rodrigo.natividad', 'rodrigo.n@corvex.ph', hash_default,
       r.id, NULL, '+63 917 555 0003', 'Manila', 'SA-0003', 'RN', 'Inactive'
FROM roles r WHERE r.slug = 'super_admin'
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- USERS — Operating Managers (4)
-- ============================================================
INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Elena Mercado', 'elena.mercado', 'elena.mercado@corvex.ph', hash_default,
       r.id, NULL, '+63 918 555 4400', 'Davao City', 'OM-2001', 'EM', 'Active'
FROM roles r WHERE r.slug = 'operating_manager'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Roberto Villanueva', 'roberto.v', 'roberto.villanueva@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 917 555 2200', '88 MacArthur Highway, Davao City', 'OM-2002', 'RV', 'Active'
FROM roles r WHERE r.slug = 'operating_manager'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Miguel Flores', 'miguel.flores', 'miguel.f@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'General Santos Branch'),
       '+63 920 555 3300', '12 Magsaysay Ave, General Santos City', 'OM-2003', 'MF', 'Active'
FROM roles r WHERE r.slug = 'operating_manager'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Grace Tan', 'grace.tan', 'grace.t@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
       '+63 915 555 4400', '5 Dahican Road, Mati City', 'OM-2004', 'GT', 'Active'
FROM roles r WHERE r.slug = 'operating_manager'
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- USERS — Inventory Staff (4)
-- ============================================================
INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Ana Reyes', 'ana.reyes', 'ana.r@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
       '+63 917 888 7766', 'Mati City, Davao Oriental', 'WH-3051', 'AR', 'Active'
FROM roles r WHERE r.slug = 'inventory_staff'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Ben Cruz', 'ben.cruz', 'ben.c@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'General Santos Branch'),
       '+63 921 777 6655', 'General Santos City', 'WH-3052', 'BC', 'Inactive'
FROM roles r WHERE r.slug = 'inventory_staff'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Florencia Ramos', 'florencia.ramos', 'florencia.r@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 928 666 5544', 'Davao City', 'WH-3053', 'FR', 'Active'
FROM roles r WHERE r.slug = 'inventory_staff'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Danilo Ocampo', 'danilo.ocampo', 'danilo.o@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
       '+63 933 555 4433', 'Mati City', 'WH-3054', 'DO', 'Active'
FROM roles r WHERE r.slug = 'inventory_staff'
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- USERS — Sales Staff (5)
-- ============================================================
INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Carlos Mendoza', 'carlos.mendoza', 'carlos.m@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'General Santos Branch'),
       '+63 918 222 3344', 'General Santos City', 'SA-1087', 'CM', 'Active'
FROM roles r WHERE r.slug = 'sales_staff'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Jane Smith', 'jane.smith', 'jane.s@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 916 333 2211', 'Davao City', 'SA-1088', 'JS', 'Active'
FROM roles r WHERE r.slug = 'sales_staff'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Robert Lee', 'robert.lee', 'robert.l@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
       '+63 920 444 5566', 'Mati City', 'SA-1089', 'RL', 'Active'
FROM roles r WHERE r.slug = 'sales_staff'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Patricia Cruz', 'patricia.cruz', 'patricia.c@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'General Santos Branch'),
       '+63 927 555 6677', 'General Santos City', 'SA-1090', 'PC', 'Active'
FROM roles r WHERE r.slug = 'sales_staff'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Jose Bautista', 'jose.bautista', 'jose.b@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 912 888 9900', 'Davao City', 'SA-1091', 'JB', 'Inactive'
FROM roles r WHERE r.slug = 'sales_staff'
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- USERS — Collectors (5)
-- ============================================================
INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Maria Dela Cruz', 'maria.delacruz', 'maria.dc@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 917 555 0142', 'Davao City', 'COL-2048', 'MD', 'Active'
FROM roles r WHERE r.slug = 'collector'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'John Dela Cruz', 'john.delacruz', 'john.dc@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 918 444 0133', 'Davao City', 'COL-2049', 'JD', 'Active'
FROM roles r WHERE r.slug = 'collector'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Pedro Garcia', 'pedro.garcia', 'pedro.g@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 919 555 0124', 'Davao City', 'COL-2050', 'PG', 'Active'
FROM roles r WHERE r.slug = 'collector'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Luz Bernardo', 'luz.bernardo', 'luz.b@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'General Santos Branch'),
       '+63 920 333 0115', 'General Santos City', 'COL-2051', 'LB', 'Active'
FROM roles r WHERE r.slug = 'collector'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Ramon Aquino', 'ramon.aquino', 'ramon.a@corvex.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
       '+63 915 222 0106', 'Mati City', 'COL-2052', 'RA', 'Active'
FROM roles r WHERE r.slug = 'collector'
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- USERS — Clients (5)
-- ============================================================
INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Luntiang Tahanan Interiors', 'luntiang.tahanan', 'luntiang.tahanan@email.com', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 912 345 6789', '42 Ilustre Ave, Davao City', NULL, 'LT', 'Active'
FROM roles r WHERE r.slug = 'client'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Furniture Plus GenSan', 'furniture.plus', 'furniture.plus@gensan.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'General Santos Branch'),
       '+63 917 111 2233', '120 Pioneer Ave, General Santos City', NULL, 'FP', 'Active'
FROM roles r WHERE r.slug = 'client'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Casa Moderna Furniture', 'casa.moderna', 'casa.moderna@email.com', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 918 765 4321', '18 JP Laurel Ave, Davao City', NULL, 'CM2', 'Active'
FROM roles r WHERE r.slug = 'client'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Abode Furniture Warehouse', 'abode.furniture', 'abode.furniture@gensan.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'General Santos Branch'),
       '+63 912 333 4455', '44 General Santos Drive, General Santos City', NULL, 'AF', 'Active'
FROM roles r WHERE r.slug = 'client'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (full_name, username, email, password_hash, role_id, branch_id, contact_number, address, employee_id, avatar_initials, status)
SELECT 'Mabuhay Sala Sets', 'mabuhay.sala', 'mabuhay.sala@davao.ph', hash_default,
       r.id, (SELECT id FROM branches WHERE name = 'Davao City Branch'),
       '+63 919 333 2211', '33 R. Castillo St, Davao City', NULL, 'MS2', 'Suspended'
FROM roles r WHERE r.slug = 'client'
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- CLIENTS (extended records)
-- ============================================================
INSERT INTO clients (account_number, client_name, business_name, business_type, contact_person, phone, email, address, branch_id, credit_limit, outstanding_balance, status, days_overdue, risk_level, blacklisted, total_purchases, assigned_collector, account_open_date, last_visit_date, user_id)
VALUES
(
    'ACC-1001', 'Luntiang Tahanan Interiors', 'Luntiang Tahanan Interiors', 'Furniture Retail Store',
    'Juan Santos', '+63 912 345 6789', 'luntiang.tahanan@email.com',
    '42 Ilustre Ave, Davao City',
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    200000, 48500, 'Overdue', 14, 'Medium', FALSE, 842000,
    (SELECT id FROM users WHERE username='maria.delacruz'),
    '2024-03-15', '2026-06-20',
    (SELECT id FROM users WHERE email='luntiang.tahanan@email.com')
),
(
    'ACC-1002', 'Casa Moderna Furniture', 'Casa Moderna Furniture', 'Furniture Retail Store',
    'Conchita Reyes', '+63 918 765 4321', 'casa.moderna@email.com',
    '18 JP Laurel Ave, Davao City',
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    150000, 22000, 'Pending', 9, 'Low', FALSE, 445000,
    (SELECT id FROM users WHERE username='john.delacruz'),
    '2024-06-01', '2026-06-19',
    (SELECT id FROM users WHERE email='casa.moderna@email.com')
),
(
    'ACC-1003', 'Hardin ng Bahay Home Store', 'Hardin ng Bahay Home Store Inc.', 'Home Store',
    'Maribel Santos', '+63 905 111 2233', 'hardin.bahay@davao.ph',
    '7 Quirino Ave, Davao City',
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    120000, 15800, 'Pending', 6, 'Low', FALSE, 380000,
    (SELECT id FROM users WHERE username='maria.delacruz'),
    '2024-05-10', '2026-06-19', NULL
),
(
    'ACC-1004', 'Soledad Furniture Gallery', 'Soledad Furniture Gallery Corp.', 'Furniture Gallery',
    'Sol Padilla', '+63 927 888 9900', 'soledad.furniture@davao.ph',
    '55 McArthur Highway, Davao City',
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    100000, 0, 'Current', 0, 'Low', FALSE, 320000,
    (SELECT id FROM users WHERE username='pedro.garcia'),
    '2024-01-10', '2026-06-24', NULL
),
(
    'ACC-1005', 'Dreamspace Living', 'Dreamspace Living Inc.', 'Furniture Retail Store',
    'Alma Garcia', '+63 916 444 5566', 'dreamspace@davao.ph',
    '91 Sandawa Rd, Davao City',
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    80000, 0, 'Current', 0, 'Low', FALSE, 215000,
    (SELECT id FROM users WHERE username='maria.delacruz'),
    '2024-08-15', '2026-06-24', NULL
),
(
    'ACC-1006', 'Mabuhay Sala Sets', 'Mabuhay Sala Sets', 'Sala Set Specialty',
    'Ernesto Cruz', '+63 919 333 2211', 'mabuhay.sala@davao.ph',
    '33 R. Castillo St, Davao City',
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    100000, 38000, 'Blacklisted', 28, 'Critical', TRUE, 155000,
    (SELECT id FROM users WHERE username='john.delacruz'),
    '2023-11-05', '2026-05-28',
    (SELECT id FROM users WHERE email='mabuhay.sala@davao.ph')
),
(
    'ACC-2001', 'Furniture Plus GenSan', 'Furniture Plus Trading Corp', 'Furniture Showroom',
    'Rosario Bautista', '+63 917 111 2233', 'furniture.plus@gensan.ph',
    '120 Pioneer Ave, General Santos City',
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    500000, 0, 'Current', 0, 'Low', FALSE, 1240000,
    (SELECT id FROM users WHERE username='carlos.mendoza'),
    '2023-08-01', '2026-06-25',
    (SELECT id FROM users WHERE email='furniture.plus@gensan.ph')
),
(
    'ACC-2002', 'Home Essentials SoCCSKSargen', 'Home Essentials Corp', 'Home Store',
    'Rosa Gutierrez', '+63 920 444 5566', 'homeessentials.socc@email.com',
    '88 Santiago Blvd, General Santos City',
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    150000, 0, 'Current', 0, 'Low', FALSE, 620000,
    (SELECT id FROM users WHERE username='carlos.mendoza'),
    '2024-02-20', '2026-06-18', NULL
),
(
    'ACC-2003', 'Living Space Interiors', 'Living Space Interiors Inc', 'Interior Design',
    'Cesar Navarro', '+63 915 777 8899', 'livingspace.gensan@email.com',
    '15 City Heights Drive, General Santos City',
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    100000, 0, 'Active', 0, 'Low', FALSE, 415000,
    (SELECT id FROM users WHERE username='patricia.cruz'),
    '2024-04-05', '2026-06-15', NULL
),
(
    'ACC-2004', 'Abode Furniture Warehouse', 'Abode Furniture Warehouse Co.', 'Furniture Wholesale',
    'Marco Reyes', '+63 912 333 4455', 'abode.furniture@gensan.ph',
    '44 General Santos Drive, General Santos City',
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    200000, 82000, 'Overdue', 21, 'High', FALSE, 298000,
    (SELECT id FROM users WHERE username='luz.bernardo'),
    '2024-01-20', '2026-06-10',
    (SELECT id FROM users WHERE email='abode.furniture@gensan.ph')
),
(
    'ACC-3001', 'Oriental Living Hub', 'Oriental Living Hub Corp.', 'Furniture Retail Store',
    'Nora Vasquez', '+63 916 123 4567', 'oriental.living@mati.ph',
    '18 Lapu-Lapu St, Mati City',
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    120000, 12000, 'Active', 0, 'Low', FALSE, 240000,
    (SELECT id FROM users WHERE username='ramon.aquino'),
    '2024-07-01', '2026-06-22', NULL
)
ON CONFLICT (account_number) DO NOTHING;

-- ============================================================
-- PRODUCTS
-- ============================================================
INSERT INTO products (name, sku, category, description, unit_price, unit_type, barcode, supplier_id, reorder_point) VALUES
    ('3-Seater Fabric Sofa (Beige)',         'SOF-3FB-001', 'Sofas',            'Modern 3-seater fabric sofa, beige upholstery, solid wood legs.',                    18500, 'Unit', '8901234500001', (SELECT id FROM suppliers WHERE name='Mindanao Wood Crafts'),       8),
    ('6-Seater Dining Table Set (Narra)',     'DNG-6NT-002', 'Dining Tables',    'Solid Narra wood 6-seater dining table with matching chairs.',                        42000, 'Set',  '8901234500002', (SELECT id FROM suppliers WHERE name='Mindanao Wood Crafts'),       6),
    ('Ergonomic Office Chair (Black Mesh)',   'CHR-EOB-003', 'Office Chairs',    'Adjustable ergonomic office chair with lumbar support and mesh back.',                8500,  'Unit', '8901234500003', (SELECT id FROM suppliers WHERE name='ErgoCraft Philippines'),      10),
    ('Queen Size Bed Frame (Walnut Veneer)',  'BED-QWV-004', 'Beds',             'Queen bed frame with walnut veneer finish and under-bed storage.',                    22000, 'Unit', '8901234500004', (SELECT id FROM suppliers WHERE name='PhilFurniture Manufacturing'),  5),
    ('3-Door Wardrobe (White Gloss)',         'WRD-3DG-005', 'Wardrobes',        '3-door sliding wardrobe with white gloss finish and mirror panel.',                   18500, 'Unit', '8901234500005', (SELECT id FROM suppliers WHERE name='KabinetPro Davao'),            6),
    ('Coffee Table (Tempered Glass & Steel)', 'CTB-TGS-006', 'Coffee Tables',   'Modern coffee table with tempered glass top and stainless steel frame.',               7500,  'Unit', '8901234500006', (SELECT id FROM suppliers WHERE name='Glasscraft Furniture'),        8),
    ('TV Stand with Cabinet (Oak)',           'TVS-CAB-007', 'TV Stands',        'Oak finish TV stand with 2-door cabinet and open shelves.',                            6000,  'Unit', '8901234500007', (SELECT id FROM suppliers WHERE name='KabinetPro Davao'),            5),
    ('5-Shelf Bookcase (Natural Wood)',       'BSH-5NW-008', 'Bookshelves',      'Freestanding 5-shelf bookcase in natural wood finish.',                                5500,  'Unit', '8901234500008', (SELECT id FROM suppliers WHERE name='Mindanao Wood Crafts'),        6),
    ('Orthopedic Queen Mattress (8-inch)',    'MAT-OQ8-009', 'Mattresses',       'High-density foam orthopedic queen mattress, 8-inch profile.',                        9800,  'Unit', '8901234500009', (SELECT id FROM suppliers WHERE name='SleepWell PH'),               5),
    ('L-Shape Study Desk (White)',            'DSK-LWH-010', 'Desks',            'L-shaped study desk with side cabinet and cable management.',                          8200,  'Unit', '8901234500010', (SELECT id FROM suppliers WHERE name='ErgoCraft Philippines'),       5),
    ('Outdoor Rattan Set (4-pc)',             'OUT-RT4-011', 'Outdoor Furniture','4-piece outdoor rattan set: 2 chairs, 1 sofa, 1 coffee table.',                       14500, 'Set',  '8901234500011', (SELECT id FROM suppliers WHERE name='Davao Rattan Exports'),        4),
    ('4-Door Storage Cabinet (Melamine)',     'CAB-4ML-012', 'Cabinets',         '4-door melamine storage cabinet with adjustable shelves.',                             6800,  'Unit', '8901234500012', (SELECT id FROM suppliers WHERE name='KabinetPro Davao'),            6),
    ('L-Shape Sofa (Gray)',                   'SOF-LSH-013', 'Sofas',            'Modern L-shape corner sofa in gray fabric, chaise lounge with storage.',              28500, 'Unit', '8901234500013', (SELECT id FROM suppliers WHERE name='PhilFurniture Manufacturing'),  5)
ON CONFLICT (sku) DO NOTHING;

-- ============================================================
-- INVENTORY (stock per product per branch)
-- ============================================================
INSERT INTO inventory (product_id, branch_id, quantity, stock_status, last_updated)
SELECT p.id, b.id, qty, v.status, NOW()
FROM (VALUES
    ('SOF-3FB-001', 'Davao City Branch',    8,  'Sufficient'),
    ('SOF-3FB-001', 'General Santos Branch',6,  'Sufficient'),
    ('SOF-3FB-001', 'Davao Oriental Branch',22, 'Sufficient'),
    ('DNG-6NT-002', 'Davao City Branch',    7,  'Sufficient'),
    ('DNG-6NT-002', 'General Santos Branch',4,  'Low Stock'),
    ('DNG-6NT-002', 'Davao Oriental Branch',5,  'Low Stock'),
    ('CHR-EOB-003', 'Davao City Branch',    12, 'Sufficient'),
    ('CHR-EOB-003', 'General Santos Branch',0,  'Out of Stock'),
    ('CHR-EOB-003', 'Davao Oriental Branch',0,  'Out of Stock'),
    ('BED-QWV-004', 'Davao City Branch',    6,  'Sufficient'),
    ('BED-QWV-004', 'General Santos Branch',4,  'Critical Stock'),
    ('BED-QWV-004', 'Davao Oriental Branch',8,  'Sufficient'),
    ('WRD-3DG-005', 'Davao City Branch',    18, 'Sufficient'),
    ('WRD-3DG-005', 'General Santos Branch',5,  'Low Stock'),
    ('WRD-3DG-005', 'Davao Oriental Branch',7,  'Sufficient'),
    ('CTB-TGS-006', 'Davao City Branch',    15, 'Sufficient'),
    ('CTB-TGS-006', 'General Santos Branch',8,  'Sufficient'),
    ('CTB-TGS-006', 'Davao Oriental Branch',30, 'Sufficient'),
    ('TVS-CAB-007', 'Davao City Branch',    12, 'Sufficient'),
    ('TVS-CAB-007', 'General Santos Branch',7,  'Sufficient'),
    ('TVS-CAB-007', 'Davao Oriental Branch',4,  'Low Stock'),
    ('BSH-5NW-008', 'Davao City Branch',    6,  'Sufficient'),
    ('BSH-5NW-008', 'General Santos Branch',9,  'Sufficient'),
    ('BSH-5NW-008', 'Davao Oriental Branch',5,  'Low Stock'),
    ('MAT-OQ8-009', 'Davao City Branch',    5,  'Sufficient'),
    ('MAT-OQ8-009', 'General Santos Branch',3,  'Critical Stock'),
    ('MAT-OQ8-009', 'Davao Oriental Branch',7,  'Sufficient'),
    ('DSK-LWH-010', 'Davao City Branch',    3,  'Critical Stock'),
    ('DSK-LWH-010', 'General Santos Branch',6,  'Sufficient'),
    ('DSK-LWH-010', 'Davao Oriental Branch',4,  'Low Stock'),
    ('OUT-RT4-011', 'Davao City Branch',    4,  'Sufficient'),
    ('OUT-RT4-011', 'General Santos Branch',6,  'Sufficient'),
    ('OUT-RT4-011', 'Davao Oriental Branch',3,  'Low Stock'),
    ('CAB-4ML-012', 'Davao City Branch',    10, 'Sufficient'),
    ('CAB-4ML-012', 'General Santos Branch',8,  'Sufficient'),
    ('CAB-4ML-012', 'Davao Oriental Branch',14, 'Sufficient'),
    ('SOF-LSH-013', 'Davao City Branch',    6,  'Sufficient'),
    ('SOF-LSH-013', 'General Santos Branch',14, 'Sufficient'),
    ('SOF-LSH-013', 'Davao Oriental Branch',3,  'Low Stock')
) AS v(sku, branch_name, qty, status)
JOIN products p ON p.sku = v.sku
JOIN branches b ON b.name = v.branch_name
ON CONFLICT (product_id, branch_id) DO NOTHING;

-- ============================================================
-- COLLECTION PAYMENTS
-- ============================================================
INSERT INTO collection_payments (receipt_number, client_id, collector_id, branch_id, amount, payment_method, payment_date, payment_time, status, notes)
VALUES
(
    'RCP-2024-0042',
    (SELECT id FROM clients WHERE account_number='ACC-1004'),
    (SELECT id FROM users WHERE username='maria.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    9200, 'Cash', '2026-06-24', '10:32', 'Confirmed', 'Full payment — account cleared'
),
(
    'RCP-2024-0041',
    (SELECT id FROM clients WHERE account_number='ACC-1005'),
    (SELECT id FROM users WHERE username='maria.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    6500, 'Cash', '2026-06-24', '09:15', 'Confirmed', 'Full payment'
),
(
    'RCP-001',
    (SELECT id FROM clients WHERE account_number='ACC-1001'),
    (SELECT id FROM users WHERE username='maria.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    12000, 'Bank Transfer', '2026-06-20', '14:45', 'Confirmed', 'Partial payment on overdue account'
),
(
    'RCP-002',
    (SELECT id FROM clients WHERE account_number='ACC-1001'),
    (SELECT id FROM users WHERE username='maria.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    8500, 'Cash', '2026-06-18', '10:00', 'Confirmed', 'Partial payment'
),
(
    'RCP-003',
    (SELECT id FROM clients WHERE account_number='ACC-1001'),
    (SELECT id FROM users WHERE username='john.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    5000, 'Check', '2026-06-15', '11:30', 'Confirmed', NULL
),
(
    'RCP-004',
    (SELECT id FROM clients WHERE account_number='ACC-1001'),
    (SELECT id FROM users WHERE username='maria.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    15000, 'Bank Transfer', '2026-06-10', '09:00', 'Confirmed', NULL
),
(
    'RCP-010',
    (SELECT id FROM clients WHERE account_number='ACC-1002'),
    (SELECT id FROM users WHERE username='maria.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    10000, 'Check', '2026-06-19', '11:20', 'Pending Review', 'Check pending clearance'
),
(
    'RCP-021',
    (SELECT id FROM clients WHERE account_number='ACC-2004'),
    (SELECT id FROM users WHERE username='luz.bernardo'),
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    15000, 'Cash', '2026-06-01', '10:00', 'Confirmed', 'Partial payment on overdue account'
),
(
    'RCP-030',
    (SELECT id FROM clients WHERE account_number='ACC-1006'),
    (SELECT id FROM users WHERE username='john.delacruz'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    5000, 'Cash', '2026-05-28', '15:00', 'Confirmed', 'Last payment before blacklist'
)
ON CONFLICT (receipt_number) DO NOTHING;

-- ============================================================
-- SALES INVOICES
-- ============================================================
WITH inv_insert AS (
    INSERT INTO sales_invoices (invoice_number, client_id, sales_agent_id, branch_id, total_amount, payment_method, status, invoice_date, notes)
    VALUES
    (
        'INV-2024-0089',
        (SELECT id FROM clients WHERE account_number='ACC-2001'),
        (SELECT id FROM users WHERE username='carlos.mendoza'),
        (SELECT id FROM branches WHERE name='General Santos Branch'),
        48000, 'Cash', 'Confirmed', '2026-06-24', 'Display replenishment order.'
    ),
    (
        'INV-2024-0088',
        (SELECT id FROM clients WHERE account_number='ACC-2001'),
        (SELECT id FROM users WHERE username='carlos.mendoza'),
        (SELECT id FROM branches WHERE name='General Santos Branch'),
        128000, 'Bank Transfer', 'Confirmed', '2026-06-21', 'Monthly showroom restock.'
    ),
    (
        'INV-2024-0087',
        (SELECT id FROM clients WHERE account_number='ACC-2002'),
        (SELECT id FROM users WHERE username='carlos.mendoza'),
        (SELECT id FROM branches WHERE name='General Santos Branch'),
        86000, 'Check', 'Pending Review', '2026-06-18', 'Partial delivery requested.'
    ),
    (
        'INV-2024-0086',
        (SELECT id FROM clients WHERE account_number='ACC-1001'),
        (SELECT id FROM users WHERE username='jane.smith'),
        (SELECT id FROM branches WHERE name='Davao City Branch'),
        95000, 'Bank Transfer', 'Confirmed', '2026-06-14', 'Quarterly bulk order.'
    ),
    (
        'INV-2024-0085',
        (SELECT id FROM clients WHERE account_number='ACC-1003'),
        (SELECT id FROM users WHERE username='jane.smith'),
        (SELECT id FROM branches WHERE name='Davao City Branch'),
        36500, 'Cash', 'Confirmed', '2026-06-10', 'Store refresh order.'
    )
    ON CONFLICT (invoice_number) DO NOTHING
    RETURNING id, invoice_number
)
-- Invoice items
INSERT INTO sales_invoice_items (invoice_id, product_id, quantity, unit_price)
SELECT inv.id, p.id, items.qty, items.price
FROM inv_insert inv
JOIN (VALUES
    ('INV-2024-0089', 'CTB-TGS-006', 4, 7500),
    ('INV-2024-0089', 'TVS-CAB-007', 3, 6000),
    ('INV-2024-0088', 'SOF-LSH-013', 3, 28500),
    ('INV-2024-0088', 'CHR-EOB-003', 5, 8500),
    ('INV-2024-0087', 'DNG-6NT-002', 2, 42000),
    ('INV-2024-0086', 'BED-QWV-004', 2, 22000),
    ('INV-2024-0086', 'MAT-OQ8-009', 5, 9800),
    ('INV-2024-0085', 'WRD-3DG-005', 1, 18500),
    ('INV-2024-0085', 'BSH-5NW-008', 2, 5500),
    ('INV-2024-0085', 'CAB-4ML-012', 1, 6800)
) AS items(inv_num, sku, qty, price) ON inv.invoice_number = items.inv_num
JOIN products p ON p.sku = items.sku
ON CONFLICT DO NOTHING;

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================
INSERT INTO stock_movements (movement_ref, product_id, branch_id, quantity, type, notes, movement_date)
VALUES
(
    'MOV-1042',
    (SELECT id FROM products WHERE sku='SOF-3FB-001'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    -2, 'Sale Deduction', 'Sales order SO-4421', '2026-06-23'
),
(
    'MOV-1041',
    (SELECT id FROM products WHERE sku='SOF-3FB-001'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    10, 'Restock', 'Supplier delivery RST-8821', '2026-06-20'
),
(
    'MOV-1040',
    (SELECT id FROM products WHERE sku='SOF-3FB-001'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    -3, 'Transfer Out', 'Transfer to Davao City Branch', '2026-06-18'
),
(
    'MOV-1039',
    (SELECT id FROM products WHERE sku='DNG-6NT-002'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    -1, 'Stock Count Adjustment', 'Physical count variance', '2026-06-22'
),
(
    'MOV-1038',
    (SELECT id FROM products WHERE sku='BED-QWV-004'),
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    4, 'Transfer In', 'Received from Davao Oriental', '2026-06-19'
),
(
    'MOV-1037',
    (SELECT id FROM products WHERE sku='CHR-EOB-003'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    -4, 'Sale Deduction', 'Bulk office order', '2026-06-23'
)
ON CONFLICT (movement_ref) DO NOTHING;

-- ============================================================
-- TRANSFERS
-- ============================================================
INSERT INTO transfers (transfer_ref, product_id, quantity, source_branch_id, destination_branch_id, status, submitted_by, submitted_date, notes)
VALUES
(
    'TRF-301',
    (SELECT id FROM products WHERE sku='SOF-3FB-001'),
    4,
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    'Pending Approval',
    (SELECT id FROM users WHERE username='ana.reyes'),
    '2026-06-25',
    'Davao City showroom restock'
),
(
    'TRF-300',
    (SELECT id FROM products WHERE sku='DNG-6NT-002'),
    2,
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    'Approved',
    (SELECT id FROM users WHERE username='ana.reyes'),
    '2026-06-24',
    'Branch showroom replenishment'
),
(
    'TRF-299',
    (SELECT id FROM products WHERE sku='SOF-3FB-001'),
    3,
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    'Completed',
    (SELECT id FROM users WHERE username='ana.reyes'),
    '2026-06-18',
    'Routine stock rebalancing'
),
(
    'TRF-298',
    (SELECT id FROM products WHERE sku='WRD-3DG-005'),
    3,
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    (SELECT id FROM branches WHERE name='General Santos Branch'),
    'Rejected',
    (SELECT id FROM users WHERE username='ana.reyes'),
    '2026-06-18',
    'Rejected: insufficient stock'
)
ON CONFLICT (transfer_ref) DO NOTHING;

-- ============================================================
-- RESTOCK RECORDS
-- ============================================================
INSERT INTO restock_records (restock_ref, product_id, supplier_id, branch_id, quantity, delivery_ref, date_received, received_by)
VALUES
(
    'RST-8821',
    (SELECT id FROM products WHERE sku='SOF-3FB-001'),
    (SELECT id FROM suppliers WHERE name='Mindanao Wood Crafts'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    10, 'DEL-4421', '2026-06-20',
    (SELECT id FROM users WHERE username='ana.reyes')
),
(
    'RST-8819',
    (SELECT id FROM products WHERE sku='DNG-6NT-002'),
    (SELECT id FROM suppliers WHERE name='Mindanao Wood Crafts'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    6, 'DEL-4398', '2026-06-18',
    (SELECT id FROM users WHERE username='ana.reyes')
),
(
    'RST-8815',
    (SELECT id FROM products WHERE sku='CTB-TGS-006'),
    (SELECT id FROM suppliers WHERE name='Glasscraft Furniture'),
    (SELECT id FROM branches WHERE name='Davao Oriental Branch'),
    12, 'DEL-4355', '2026-06-15',
    (SELECT id FROM users WHERE username='ana.reyes')
),
(
    'RST-8810',
    (SELECT id FROM products WHERE sku='WRD-3DG-005'),
    (SELECT id FROM suppliers WHERE name='KabinetPro Davao'),
    (SELECT id FROM branches WHERE name='Davao City Branch'),
    8, 'DEL-4310', '2026-06-12',
    (SELECT id FROM users WHERE username='florencia.ramos')
)
ON CONFLICT (restock_ref) DO NOTHING;

-- ============================================================
-- AUDIT LOGS
-- ============================================================
INSERT INTO audit_logs (user_name, action, module, ip_address, status, details, created_at)
VALUES
('Patricia Reyes',     'User Created',            'User Management',      '192.168.1.10', 'Success', 'Created user: john.delacruz',           '2026-06-30 08:32:00+08'),
('Marcus Santos',      'Permission Updated',       'Role Management',      '192.168.1.2',  'Success', 'Updated Collector permissions',         '2026-06-30 08:15:00+08'),
('Elena Mercado',      'Report Exported',          'Reports',              '192.168.1.20', 'Success', 'Exported executive summary report',     '2026-06-30 08:00:00+08'),
('Roberto Villanueva', 'CI Approved',              'Credit Investigation', '192.168.1.22', 'Success', 'Approved CI for Abode Furniture',       '2026-06-29 16:45:00+08'),
('Patricia Reyes',     'Branch Updated',           'Branch Management',    '192.168.1.10', 'Success', 'Updated Davao Oriental branch manager', '2026-06-29 15:10:00+08'),
('Marcus Santos',      'Backup Created',           'System',               '192.168.1.2',  'Success', 'Manual backup — 184 MB',                '2026-06-29 11:00:00+08'),
('Ben Cruz',           'Login Failed',             'Auth',                 '192.168.1.55', 'Failed',  'Invalid password attempt (3rd)',        '2026-06-29 10:22:00+08'),
('Patricia Reyes',     'User Disabled',            'User Management',      '192.168.1.10', 'Success', 'Disabled user: ben.cruz',               '2026-06-28 09:14:00+08'),
('Marcus Santos',      'System Settings Updated',  'System Settings',      '192.168.1.2',  'Success', 'Updated backup schedule',               '2026-06-28 08:00:00+08'),
('Elena Mercado',      'GIS Layer Accessed',        'GIS',                  '192.168.1.20', 'Success', 'Loaded delinquency cluster layer',      '2026-06-27 17:30:00+08');

-- ============================================================
-- NOTIFICATIONS (sample for multiple users)
-- ============================================================
INSERT INTO notifications (user_id, type, title, message, is_read, related_to, created_at)
SELECT u.id, n.type, n.title, n.message, n.is_read, n.related_to, n.created_at::TIMESTAMPTZ
FROM (VALUES
    ('maria.delacruz', 'assignment', 'New accounts assigned', '3 new accounts added to your route for today.', FALSE, '/collector/route',      '2026-06-30 08:00:00+08'),
    ('maria.delacruz', 'route',      'Route updated',         'Stop order updated for Davao City cluster.',     FALSE, '/collector/route',      '2026-06-30 07:45:00+08'),
    ('maria.delacruz', 'collection', 'Collection confirmed',  'Payment of PHP 9,200 for Soledad confirmed.',    TRUE,  '/collector/history',    '2026-06-29 10:00:00+08'),
    ('carlos.mendoza', 'stock',      'Zero stock alert',      'Office Chair (Ergonomic) is out of stock at General Santos.', FALSE, '/sales/inventory', '2026-06-30 09:10:00+08'),
    ('carlos.mendoza', 'sale',       'Sale confirmed',        'Invoice INV-2024-0089 confirmed for Casa Elegante.', TRUE, '/sales/history',    '2026-06-29 10:32:00+08'),
    ('ana.reyes',      'critical',   'Critical stock alert',  'Queen Size Bed Frame (Walnut Veneer) critically low (4 units).', FALSE, '/warehouse/product/p4', '2026-06-30 09:30:00+08'),
    ('ana.reyes',      'transfer',   'Transfer approval required', 'Transfer TRF-301 (Sofa x4 to Davao City) pending approval.', FALSE, '/warehouse/transfers', '2026-06-30 08:45:00+08'),
    ('marcus.santos',  'security',   'Failed login attempt',  'ben.c@corvex.ph — 3 failed login attempts from 192.168.1.55.', FALSE, '/super-admin/audit-logs', '2026-06-29 10:22:00+08'),
    ('elena.mercado',  'Branch Alerts', 'Davao Oriental alert escalated', 'Davao Oriental delinquency alert escalated to Critical.', FALSE, '/operating-manager/alerts', '2026-06-30 08:00:00+08')
) AS n(username, type, title, message, is_read, related_to, created_at)
JOIN users u ON u.username = n.username
ON CONFLICT DO NOTHING;

END $$;
