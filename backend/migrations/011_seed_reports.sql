-- ============================================================
-- Seed: Reports & Analytics historical data
-- Tables: field_visits, field_activity_reports, sales_invoices,
--         sales_invoice_items, collection_payment, saw_results,
--         performance_summary
--
-- Purpose: Populate last 4 weeks of realistic data so Reports
-- & Analytics charts display accurate values from the database.
-- ============================================================

BEGIN;

-- ============================================================
-- Helper: staff and customer IDs by branch
-- ============================================================
-- Davao City (branch 1): collectors 10,11,12 | sales 7 | customers 1,3,4,5
-- General Santos (branch 2): sales 8 | customers 2,7,8
-- Davao Oriental (branch 3): sales 9 | customers 9,11

-- ============================================================
-- HISTORICAL FIELD VISITS (last 4 weeks)
-- ============================================================
INSERT INTO field_visits (customer_id, user_id, visit_type, scheduled_date, status) VALUES
-- Week 1 (Jul 7-13)
(1, 10, 'Collection', '2026-07-07', 'Completed'),
(3, 10, 'Collection', '2026-07-07', 'Completed'),
(4, 11, 'Collection', '2026-07-08', 'Completed'),
(5, 12, 'Collection', '2026-07-08', 'Completed'),
(1, 7, 'Sales', '2026-07-09', 'Completed'),
(3, 7, 'Sales', '2026-07-09', 'Completed'),
(2, 8, 'Sales', '2026-07-10', 'Completed'),
(7, 8, 'Sales', '2026-07-10', 'Completed'),
(9, 9, 'Sales', '2026-07-11', 'Completed'),
(11, 9, 'Sales', '2026-07-11', 'Completed'),

-- Week 2 (Jul 14-20)
(1, 10, 'Collection', '2026-07-14', 'Completed'),
(3, 10, 'Collection', '2026-07-14', 'Completed'),
(4, 11, 'Collection', '2026-07-15', 'Completed'),
(5, 12, 'Collection', '2026-07-15', 'Pending'),
(1, 7, 'Sales', '2026-07-16', 'Completed'),
(3, 7, 'Sales', '2026-07-16', 'Completed'),
(2, 8, 'Sales', '2026-07-17', 'Completed'),
(7, 8, 'Sales', '2026-07-17', 'Pending'),
(9, 9, 'Sales', '2026-07-18', 'Completed'),
(11, 9, 'Sales', '2026-07-18', 'Completed'),

-- Week 3 (Jul 21-27)
(1, 10, 'Collection', '2026-07-21', 'Completed'),
(3, 10, 'Collection', '2026-07-21', 'Completed'),
(4, 11, 'Collection', '2026-07-22', 'Completed'),
(5, 12, 'Collection', '2026-07-22', 'Pending'),
(1, 7, 'Sales', '2026-07-23', 'Completed'),
(4, 7, 'Sales', '2026-07-23', 'Pending'),
(2, 8, 'Sales', '2026-07-24', 'Completed'),
(7, 8, 'Sales', '2026-07-24', 'Pending'),
(9, 9, 'Sales', '2026-07-25', 'Completed'),
(11, 9, 'Sales', '2026-07-25', 'Pending'),

-- Week 4 (Jul 28 - current)
(1, 10, 'Collection', '2026-07-28', 'Completed'),
(3, 10, 'Collection', '2026-07-28', 'Completed'),
(4, 11, 'Collection', '2026-07-28', 'Pending'),
(5, 12, 'Collection', '2026-07-29', 'Pending'),
(1, 10, 'Sales', '2026-07-29', 'Pending'),
(3, 11, 'Collection', '2026-07-29', 'Pending'),
(1, 7, 'Sales', '2026-07-28', 'Completed'),
(4, 7, 'Sales', '2026-07-29', 'Pending'),
(2, 8, 'Sales', '2026-07-28', 'Completed'),
(7, 8, 'Sales', '2026-07-29', 'Pending'),
(8, 8, 'Sales', '2026-07-29', 'Pending'),
(9, 10, 'Collection', '2026-07-28', 'Completed'),
(11, 11, 'Collection', '2026-07-29', 'Pending');

-- ============================================================
-- HISTORICAL SALES INVOICES (last 4 weeks)
-- ============================================================
INSERT INTO sales_invoices (invoice_number, customer_id, sales_agent_id, branch_id, total_amount, payment_method_id, status, invoices_date, notes) VALUES
-- Week 1
('INV-2026-0101', 1, 7, 1, 22000.00, 1, 'Confirmed', '2026-07-07', 'Weekly delivery'),
('INV-2026-0102', 3, 7, 1, 8500.00, 1, 'Confirmed', '2026-07-08', 'Coffee table'),
('INV-2026-0103', 4, 7, 1, 18000.00, 3, 'Confirmed', '2026-07-09', 'Bed frame'),
('INV-2026-0104', 2, 8, 2, 31000.00, 1, 'Confirmed', '2026-07-10', 'Dining set'),
('INV-2026-0105', 7, 8, 2, 5500.00, 1, 'Confirmed', '2026-07-11', 'Office chair'),
('INV-2026-0106', 9, 9, 3, 12000.00, 1, 'Confirmed', '2026-07-11', 'Mattress'),

-- Week 2
('INV-2026-0201', 1, 7, 1, 24500.00, 1, 'Confirmed', '2026-07-14', 'Sofa upgrade'),
('INV-2026-0202', 3, 7, 1, 9200.00, 1, 'Confirmed', '2026-07-15', 'Add-on items'),
('INV-2026-0203', 4, 7, 1, 19500.00, 3, 'Pending Review', '2026-07-16', 'Bed frame installment'),
('INV-2026-0204', 2, 8, 2, 33500.00, 1, 'Confirmed', '2026-07-17', 'Dining extension'),
('INV-2026-0205', 7, 8, 2, 6200.00, 1, 'Draft', '2026-07-18', 'Office chair x2'),
('INV-2026-0206', 9, 9, 3, 13500.00, 1, 'Confirmed', '2026-07-18', 'Mattress + base'),

-- Week 3
('INV-2026-0301', 1, 7, 1, 21000.00, 1, 'Confirmed', '2026-07-21', 'Weekly order'),
('INV-2026-0302', 3, 7, 1, 7800.00, 1, 'Confirmed', '2026-07-22', 'Table set'),
('INV-2026-0303', 4, 7, 1, 17000.00, 3, 'Confirmed', '2026-07-23', 'Wardrobe'),
('INV-2026-0304', 2, 8, 2, 29000.00, 1, 'Confirmed', '2026-07-24', 'Living room set'),
('INV-2026-0305', 7, 8, 2, 5800.00, 1, 'Confirmed', '2026-07-25', 'Desk unit'),
('INV-2026-0306', 9, 9, 3, 14000.00, 1, 'Confirmed', '2026-07-25', 'Outdoor set'),

-- Week 4 (current, already seeded in 010)
('INV-2026-0401', 1, 7, 1, 24999.00, 1, 'Confirmed', '2026-07-28', '3-seater sofa set'),
('INV-2026-0402', 3, 7, 1, 8999.00, 1, 'Confirmed', '2026-07-29', 'Coffee table'),
('INV-2026-0403', 4, 7, 1, 18999.00, 3, 'Pending Review', '2026-07-30', 'Queen bed frame'),
('INV-2026-0404', 2, 8, 2, 32999.00, 1, 'Confirmed', '2026-07-28', 'Dining table 6-seater'),
('INV-2026-0405', 7, 8, 2, 5999.00, 1, 'Draft', '2026-07-30', 'Office chair'),
('INV-2026-0406', 9, 9, 3, 12999.00, 1, 'Confirmed', '2026-07-29', 'Mattress queen'),
('INV-2026-0407', 11, 9, 3, 7999.00, 1, 'Confirmed', '2026-07-30', 'Garden bench');

-- ============================================================
-- HISTORICAL SALES INVOICE ITEMS
-- ============================================================
INSERT INTO sales_invoice_items (invoices_id, product_id, quantity, unit_price, line_total) VALUES
(1, 1, 1, 22000.00, 22000.00),
(2, 2, 1, 8500.00, 8500.00),
(3, 3, 1, 18000.00, 18000.00),
(4, 4, 1, 31000.00, 31000.00),
(5, 5, 1, 5500.00, 5500.00),
(6, 7, 1, 12000.00, 12000.00),
(7, 1, 1, 24500.00, 24500.00),
(8, 2, 1, 9200.00, 9200.00),
(9, 3, 1, 19500.00, 19500.00),
(10, 4, 1, 33500.00, 33500.00),
(11, 5, 2, 3100.00, 6200.00),
(12, 7, 1, 13500.00, 13500.00),
(13, 1, 1, 21000.00, 21000.00),
(14, 2, 1, 7800.00, 7800.00),
(15, 3, 1, 17000.00, 17000.00),
(16, 4, 1, 29000.00, 29000.00),
(17, 5, 1, 5800.00, 5800.00),
(18, 6, 1, 14000.00, 14000.00),
(19, 1, 1, 24999.00, 24999.00),
(20, 2, 1, 8999.00, 8999.00),
(21, 3, 1, 18999.00, 18999.00),
(22, 4, 1, 32999.00, 32999.00),
(23, 5, 2, 5999.00, 11998.00),
(24, 7, 1, 12999.00, 12999.00),
(25, 6, 1, 7999.00, 7999.00);

-- ============================================================
-- HISTORICAL COLLECTION PAYMENTS (last 4 weeks)
-- ============================================================
INSERT INTO collection_payment (receipt_number, customer_id, collector_id, branch_id, amount, payment_method_id, payment_date, payment_time, status, notes) VALUES
-- Week 1
('RCP-2026-0101', 1, 10, 1, 8000.00, 1, '2026-07-07', '09:30:00', 'Completed', 'Weekly collection'),
('RCP-2026-0102', 3, 10, 1, 4500.00, 1, '2026-07-07', '14:15:00', 'Completed', 'Partial payment'),
('RCP-2026-0103', 4, 11, 1, 12000.00, 1, '2026-07-08', '10:45:00', 'Completed', 'Full settlement'),
('RCP-2026-0104', 5, 12, 1, 6000.00, 1, '2026-07-08', '16:20:00', 'Completed', 'Cash payment'),
('RCP-2026-0105', 2, 10, 2, 15000.00, 1, '2026-07-10', '11:00:00', 'Completed', 'Bulk payment'),
('RCP-2026-0106', 9, 12, 3, 3500.00, 1, '2026-07-11', '13:10:00', 'Completed', 'Check payment'),

-- Week 2
('RCP-2026-0201', 1, 10, 1, 7500.00, 1, '2026-07-14', '09:00:00', 'Completed', 'Weekly collection'),
('RCP-2026-0202', 3, 10, 1, 5000.00, 1, '2026-07-14', '15:30:00', 'Completed', 'Balance payment'),
('RCP-2026-0203', 4, 11, 1, 9000.00, 1, '2026-07-15', '11:20:00', 'Completed', 'Partial'),
('RCP-2026-0204', 5, 12, 1, 5500.00, 1, '2026-07-15', '16:45:00', 'Pending', 'Awaiting verification'),
('RCP-2026-0205', 2, 10, 2, 18000.00, 1, '2026-07-17', '10:00:00', 'Completed', 'Full settlement'),
('RCP-2026-0206', 7, 8, 2, 3200.00, 1, '2026-07-17', '14:20:00', 'Completed', 'Cash'),
('RCP-2026-0207', 9, 12, 3, 4000.00, 1, '2026-07-18', '12:30:00', 'Completed', 'Check'),

-- Week 3
('RCP-2026-0301', 1, 10, 1, 7000.00, 1, '2026-07-21', '08:45:00', 'Completed', 'Weekly collection'),
('RCP-2026-0302', 3, 10, 1, 4800.00, 1, '2026-07-21', '14:00:00', 'Completed', 'Partial'),
('RCP-2026-0303', 4, 11, 1, 11000.00, 1, '2026-07-22', '10:15:00', 'Completed', 'Full settlement'),
('RCP-2026-0304', 5, 12, 1, 5200.00, 1, '2026-07-22', '16:30:00', 'Pending', 'Verification pending'),
('RCP-2026-0305', 2, 10, 2, 16000.00, 1, '2026-07-24', '09:30:00', 'Completed', 'Bulk payment'),
('RCP-2026-0306', 7, 8, 2, 4500.00, 1, '2026-07-24', '13:45:00', 'Completed', 'Cash'),
('RCP-2026-0307', 9, 12, 3, 3800.00, 1, '2026-07-25', '11:00:00', 'Completed', 'Check'),

-- Week 4 (current, already seeded in 010)
('RCP-2026-0401', 1, 10, 1, 5000.00, 1, '2026-07-28', '10:30:00', 'Completed', 'Cash payment - partial'),
('RCP-2026-0402', 3, 10, 1, 3000.00, 1, '2026-07-29', '14:15:00', 'Completed', 'Cash payment - partial'),
('RCP-2026-0403', 2, 11, 2, 8000.00, 1, '2026-07-28', '09:45:00', 'Completed', 'Full settlement'),
('RCP-2026-0404', 9, 12, 3, 4500.00, 1, '2026-07-29', '11:20:00', 'Completed', 'Check payment'),
('RCP-2026-0405', 1, 10, 1, 7000.00, 1, '2026-07-30', '16:00:00', 'Completed', 'Cash payment - remaining balance'),
('RCP-2026-0406', 4, 11, 1, 2500.00, 1, '2026-07-30', '13:10:00', 'Pending', 'Awaiting verification');

-- ============================================================
-- HISTORICAL PERFORMANCE_SUMMARY (daily records for last 4 weeks)
-- ============================================================
INSERT INTO performance_summary (branch_id, total_sales, total_collections, inventory_accuracy, generated_at) VALUES
(1, 58000.00, 19500.00, 94.50, '2026-07-07'),
(2, 42000.00, 15000.00, 91.20, '2026-07-07'),
(3, 24000.00, 3500.00, 88.75, '2026-07-07'),
(1, 61000.00, 21000.00, 94.50, '2026-07-08'),
(2, 45000.00, 18000.00, 91.20, '2026-07-08'),
(3, 26000.00, 4000.00, 88.75, '2026-07-08'),
(1, 55000.00, 18000.00, 94.50, '2026-07-09'),
(2, 39000.00, 12000.00, 91.20, '2026-07-09'),
(3, 22000.00, 3200.00, 88.75, '2026-07-09'),
(1, 62000.00, 22000.00, 95.00, '2026-07-14'),
(2, 43000.00, 16000.00, 91.50, '2026-07-14'),
(3, 25000.00, 3800.00, 89.00, '2026-07-14'),
(1, 58000.00, 19500.00, 94.50, '2026-07-15'),
(2, 41000.00, 14000.00, 91.20, '2026-07-15'),
(3, 23000.00, 3400.00, 88.75, '2026-07-15'),
(1, 64000.00, 23000.00, 95.00, '2026-07-16'),
(2, 46000.00, 17000.00, 91.50, '2026-07-16'),
(3, 27000.00, 4200.00, 89.00, '2026-07-16'),
(1, 56000.00, 17500.00, 94.50, '2026-07-21'),
(2, 40000.00, 13000.00, 91.20, '2026-07-21'),
(3, 21000.00, 3000.00, 88.75, '2026-07-21'),
(1, 61000.00, 20500.00, 95.00, '2026-07-22'),
(2, 44000.00, 15000.00, 91.50, '2026-07-22'),
(3, 25000.00, 3600.00, 89.00, '2026-07-22'),
(1, 59000.00, 19000.00, 94.50, '2026-07-23'),
(2, 42000.00, 14000.00, 91.20, '2026-07-23'),
(3, 24000.00, 3300.00, 88.75, '2026-07-23'),
(1, 52997.00, 14500.00, 94.50, '2026-07-28'),
(2, 38998.00, 8000.00, 91.20, '2026-07-28'),
(3, 20998.00, 4500.00, 88.75, '2026-07-28');

COMMIT;
