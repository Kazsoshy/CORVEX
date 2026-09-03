BEGIN;

-- ROLES
INSERT INTO roles (id, name, slug) VALUES
(1, 'Super Admin', 'super_admin'),
(2, 'Operating Manager', 'operating_manager'),
(3, 'Branch Manager', 'branch_manager'),
(4, 'Sales Agent', 'sales_agent'),
(5, 'Collector', 'collector'),
(6, 'Warehouse Staff', 'warehouse_staff'),
(7, 'Customer', 'customer');
SELECT setval('roles_id_seq', 7);

-- ROLE CREDENTIALS
INSERT INTO role_credentials (role_id, password_hash) VALUES
(1, '$2b$12$NbaX0yP7XPNHqCYi3bI/OeTWTH6Vw7Yfd9KwqHJwtyIkztchwHX6i'),
(2, '$2b$12$H/90l64IFkDNcXJBS24jOe/v9bwxj20p6vM7fh2Qfy4RVBoGxYK/m'),
(3, '$2b$12$XjTuS70x/f/Oj6fGjzccSev.xJ9ZKHkHV8wQXvow.0Se6atxdkdN2'),
(4, '$2b$12$vwPZK9zFP647R6f5DcEp6udIx4uAJ/lWGXqqFFbh5HQ8gQJxVqUhW'),
(5, '$2b$12$ZfnB2nDg6QVAZgp/j0hqJ.wAy30QcXRnhwCDccKS9U/Mwz6578Rua'),
(6, '$2b$12$KxzINBo7o/YmYIY9dJ02z.y5B2p55fAEIa2NRFKlGVJfj4skwLWZi'),
(7, '$2b$12$R4Xx3Jjnimt7LAgNV71qI.C8pdy2EIg3h2wAVis.Cm96xxlHqYSlu');

-- PERMISSIONS
INSERT INTO permissions (id, label, description) VALUES
(1, 'View Dashboard', 'Ability to view dashboard'),
(2, 'Manage Users', 'Ability to create, edit, and delete users'),
(3, 'Manage Inventory', 'Ability to update inventory and process restocks'),
(4, 'Create Sales', 'Ability to create sales invoices'),
(5, 'Process Collections', 'Ability to process payment collections');
SELECT setval('permissions_id_seq', 5);

-- ROLE PERMISSIONS
INSERT INTO role_permissions (role_id, permission_id) VALUES
(1, 1), (1, 2), (2, 1), (3, 3), (4, 4), (5, 5), (6, 3);

-- BRANCHES
INSERT INTO branches (id, name, region, address, status) VALUES
(1, 'Davao City Branch', 'Region XI', '88 MacArthur Highway, Davao City', 'Active'),
(2, 'General Santos Branch', 'Region XII', '12 Magsaysay Ave, GenSan', 'Active'),
(3, 'Mati Branch', 'Region XI', '5 Dahican Road, Mati City', 'Active'),
(4, 'Tagum Branch', 'Region XI', '120 Pioneer Ave, Tagum', 'Active'),
(5, 'Digos Branch', 'Region XI', '44 Quezon Ave, Digos', 'Active');
SELECT setval('branches_id_seq', 5);

-- USERS
INSERT INTO users (id, branch_id, role_id, username, full_name, email, status) VALUES
(1, 1, 1, 'superadmin', 'Super Admin User', 'superadmin@corvex.com', 'Active'),
(2, 1, 3, 'branchmanager', 'Branch Manager User', 'branchmanager@corvex.com', 'Active'),
(3, 1, 7, 'cust1', 'Rafael Lim', 'rafael.lim@email.com', 'Active'),
(4, 2, 7, 'cust2', 'Lorna Mendoza', 'lorna.m@email.com', 'Active'),
(5, 3, 7, 'cust3', 'Pedro Gomez', 'pedro.g@email.com', 'Active'),
(6, 1, 2, 'operatingmanager', 'Operating Manager User', 'operatingmanager@corvex.com', 'Active'),
(7, 1, 4, 'salesagent', 'Sales Agent User', 'sales@corvex.com', 'Active'),
(8, 1, 5, 'collector', 'Collector User', 'collector@corvex.com', 'Active'),
(9, 1, 6, 'warehouse', 'Warehouse Staff User', 'inventory@corvex.com', 'Active'),
(10, 1, 7, 'customer', 'Demo Customer', 'customer@corvex.com', 'Active');
SELECT setval('users_id_seq', 10);

-- PRODUCT CATEGORIES
INSERT INTO product_categories (id, name, status) VALUES
(1, 'Living Room', 'Active'),
(2, 'Bedroom', 'Active'),
(3, 'Dining Room', 'Active'),
(4, 'Office Furniture', 'Active'),
(5, 'Outdoor Furniture', 'Active');
SELECT setval('product_categories_id_seq', 5);

-- SUPPLIERS
INSERT INTO suppliers (id, name, contact, email, address, status) VALUES
(1, 'Furniture Philippines Inc', '+63 2 8123 4567', 'sales@furnitureph.com', 'Manila', 'Active'),
(2, 'Woodcraft Suppliers', '+63 2 8765 4321', 'info@woodcraft.com', 'Cebu', 'Active'),
(3, 'Comfort Foam Mfg', '+63 2 8999 8888', 'orders@comfortfoam.com', 'Davao', 'Active'),
(4, 'MetalWorks Corp', '+63 2 1111 2222', 'metal@metalworks.com', 'Bulacan', 'Active'),
(5, 'Glass Interiors', '+63 2 3333 4444', 'glass@glass.com', 'Makati', 'Active');
SELECT setval('suppliers_id_seq', 5);

-- PRODUCTS
INSERT INTO products (id, sku, name, category_id, supplier_id, unit_price, status) VALUES
(1, 'PRD-001', 'Sofa Set 3-Seater', 1, 1, 24999.00, 'Active'),
(2, 'PRD-002', 'Queen Bed Frame', 2, 2, 18999.00, 'Active'),
(3, 'PRD-003', 'Dining Table 6-Seater', 3, 2, 32999.00, 'Active'),
(4, 'PRD-004', 'Office Chair', 4, 3, 5999.00, 'Active'),
(5, 'PRD-005', 'Garden Bench', 5, 4, 7999.00, 'Active');
SELECT setval('products_id_seq', 5);

-- CUSTOMERS (5 records)
INSERT INTO customers (id, user_id, contact_person_fname, contact_person_lname, outstanding_balance, purchase_volume, credit_limit) VALUES
(1, 1, 'Corazon', 'Villanueva', 0, 0, 0),
(2, 2, 'Miguel', 'Flores', 0, 0, 0),
(3, 3, 'Rafael', 'Lim', 15000.00, 45000.00, 50000.00),
(4, 4, 'Lorna', 'Mendoza', 22000.00, 68000.00, 75000.00),
(5, 5, 'Pedro', 'Gomez', 5000.00, 10000.00, 20000.00),
(6, 10, 'Demo', 'Customer', 0, 0, 0);
SELECT setval('customers_id_seq', 6);

-- PAYMENT METHODS
INSERT INTO payment_methods (id, name, status) VALUES
(1, 'Cash', 'Active'),
(2, 'Check', 'Active'),
(3, 'Bank Transfer', 'Active'),
(4, 'GCash', 'Active'),
(5, 'Maya', 'Active');
SELECT setval('payment_methods_id_seq', 5);

-- SALES INVOICES (5 records)
INSERT INTO sales_invoices (id, invoice_number, customer_id, sales_agent_id, branch_id, total_amount, payment_method_id, status, invoices_date) VALUES
(1, 'INV-001', 3, 1, 1, 24999.00, 1, 'Confirmed', '2026-08-01'),
(2, 'INV-002', 4, 2, 2, 18999.00, 4, 'Confirmed', '2026-08-02'),
(3, 'INV-003', 5, 1, 1, 32999.00, 3, 'Confirmed', '2026-08-03'),
(4, 'INV-004', 3, 2, 2, 5999.00, 1, 'Draft', '2026-08-04'),
(5, 'INV-005', 4, 1, 1, 7999.00, 2, 'Pending Review', '2026-08-05');
SELECT setval('sales_invoices_id_seq', 5);

-- SALES INVOICE ITEMS (5 records)
INSERT INTO sales_invoice_items (id, invoice_id, product_id, quantity, unit_price, line_total) VALUES
(1, 1, 1, 1, 24999.00, 24999.00),
(2, 2, 2, 1, 18999.00, 18999.00),
(3, 3, 3, 1, 32999.00, 32999.00),
(4, 4, 4, 1, 5999.00, 5999.00),
(5, 5, 5, 1, 7999.00, 7999.00);
SELECT setval('sales_invoice_items_id_seq', 5);

-- COLLECTION PAYMENTS (5 records)
INSERT INTO collection_payment (id, receipt_number, customer_id, collector_id, branch_id, amount, payment_method_id, payment_date, payment_time, status) VALUES
(1, 'REC-001', 3, 1, 1, 5000.00, 1, '2026-08-10', '10:00:00', 'Completed'),
(2, 'REC-002', 4, 2, 2, 5000.00, 4, '2026-08-11', '11:00:00', 'Completed'),
(3, 'REC-003', 5, 1, 1, 5000.00, 3, '2026-08-12', '12:00:00', 'Completed'),
(4, 'REC-004', 3, 2, 2, 2000.00, 1, '2026-08-13', '13:00:00', 'Pending'),
(5, 'REC-005', 4, 1, 1, 3000.00, 2, '2026-08-14', '14:00:00', 'Pending');
SELECT setval('collection_payment_id_seq', 5);

-- STOCK MOVEMENTS (5 records)
INSERT INTO stock_movements (id, performed_by, product_id, quantity, type, movement_ref, reference_type, reference_id, movement_date) VALUES
(1, 1, 1, 10, 'Restock', 'MOV-001', 'restock', 1, '2026-07-01'),
(2, 2, 2, 10, 'Restock', 'MOV-002', 'restock', 2, '2026-07-02'),
(3, 1, 1, -1, 'Sale Deduction', 'MOV-003', 'sale', 1, '2026-08-01'),
(4, 2, 2, -1, 'Sale Deduction', 'MOV-004', 'sale', 2, '2026-08-02'),
(5, 1, 3, -1, 'Sale Deduction', 'MOV-005', 'sale', 3, '2026-08-03');
SELECT setval('stock_movements_id_seq', 5);

-- FIELD VISITS (5 records)
INSERT INTO field_visits (id, customer_id, user_id, visit_type, scheduled_date, status) VALUES
(1, 3, 1, 'Collection', '2026-08-10', 'Completed'),
(2, 4, 2, 'Collection', '2026-08-11', 'Completed'),
(3, 5, 1, 'Sales', '2026-08-12', 'Completed'),
(4, 3, 2, 'Sales', '2026-08-13', 'Pending'),
(5, 4, 1, 'Collection', '2026-08-14', 'Pending');
SELECT setval('field_visits_id_seq', 5);

COMMIT;
