-- ============================================================
-- Seed: Field Operations data for Branch Manager
-- Tables: field_visits, field_activity_reports, sales_invoices,
--         sales_invoice_items, collection_payment, saw_results,
--         performance_summary
--
-- Branch assignments:
--   Davao City (1): collectors 10,11,12 | sales 7 | customers 1,3,4,5
--   General Santos (2): sales 8 | customers 2,7,8
--   Davao Oriental (3): sales 9 | customers 9,11
-- ============================================================

BEGIN;

-- ============================================================
-- FIELD VISITS
-- ============================================================
INSERT INTO field_visits (customer_id, user_id, visit_type, scheduled_date, status) VALUES
-- Davao City: collectors visiting their branch customers
(1, 10, 'Collection', '2026-07-28', 'Completed'),
(3, 10, 'Collection', '2026-07-28', 'Completed'),
(4, 11, 'Collection', '2026-07-28', 'Pending'),
(5, 12, 'Collection', '2026-07-29', 'Pending'),
(1, 10, 'Sales', '2026-07-29', 'Pending'),
(3, 11, 'Collection', '2026-07-29', 'Pending'),
(5, 10, 'Sales', '2026-07-28', 'Completed'),
(6, 11, 'Sales', '2026-07-29', 'Pending'),
-- Davao City sales agent visits
(1, 7, 'Sales', '2026-07-28', 'Completed'),
(4, 7, 'Sales', '2026-07-29', 'Pending'),
(5, 7, 'Sales', '2026-07-28', 'Completed'),
(6, 7, 'Sales', '2026-07-29', 'Pending'),
-- General Santos: sales agent visiting their branch customers
(2, 8, 'Sales', '2026-07-28', 'Completed'),
(7, 8, 'Sales', '2026-07-29', 'Pending'),
(8, 8, 'Sales', '2026-07-29', 'Pending'),
-- Davao Oriental: sales agent visiting their branch customers
(9, 9, 'Sales', '2026-07-28', 'Completed'),
(11, 9, 'Sales', '2026-07-29', 'Pending');

-- ============================================================
-- FIELD ACTIVITY REPORTS
-- ============================================================
INSERT INTO field_activity_reports (visit_id, user_id, activity_type, remarks, sync_status) VALUES
(1, 10, 'Collection', 'Collected PHP 5,000. Customer paid in cash. Receipt issued.', 'Synced'),
(2, 10, 'Collection', 'Collected PHP 3,000. Partial payment. Balance remains.', 'Synced'),
(3, 11, 'Collection', 'Customer not home. Left notice slip for follow-up.', 'Synced'),
(4, 12, 'Collection', 'Scheduled for tomorrow. Confirmed via SMS.', 'Pending'),
(5, 10, 'Sales Visit', 'Presented new sofa catalog. Customer interested in 3-seater.', 'Synced'),
(6, 11, 'Collection', 'Attempted visit. Customer requested reschedule to Friday.', 'Pending'),
(7, 7, 'Sales Visit', 'Closed sale for sofa set. Customer signed delivery schedule.', 'Synced'),
(8, 7, 'Sales Visit', 'Follow-up on coffee table interest. Quoted installment option.', 'Pending'),
(9, 8, 'Sales Visit', 'Delivered dining table. Customer satisfied with assembly service.', 'Synced'),
(10, 8, 'Sales Visit', 'Presented office chair catalog. Follow-up scheduled next week.', 'Pending'),
(11, 8, 'Sales Visit', 'Visited new shop opening. Potential bulk order discussed.', 'Pending'),
(12, 9, 'Sales Visit', 'Delivered mattress. Customer requested warranty details.', 'Synced'),
(13, 9, 'Sales Visit', 'Follow-up on garden bench order. Customer comparing options.', 'Pending'),
(14, 10, 'Sales Visit', 'Discussed wardrobe options. Customer placed order for 3-door.', 'Synced'),
(15, 11, 'Sales Visit', 'Follow-up on dining table interest. Quoted installment plan.', 'Pending');

-- ============================================================
-- SALES INVOICES
-- ============================================================
INSERT INTO sales_invoices (invoice_number, customer_id, sales_agent_id, branch_id, total_amount, payment_method_id, status, invoices_date, notes) VALUES
('INV-2026-0001', 1, 7, 1, 24999.00, 1, 'Confirmed', '2026-07-25', '3-seater sofa set'),
('INV-2026-0002', 3, 7, 1, 8999.00, 1, 'Confirmed', '2026-07-26', 'Coffee table'),
('INV-2026-0003', 4, 7, 1, 18999.00, 3, 'Pending Review', '2026-07-27', 'Queen bed frame - bank transfer'),
('INV-2026-0004', 5, 7, 1, 12999.00, 1, 'Confirmed', '2026-07-26', 'Wardrobe 3-door'),
('INV-2026-0005', 6, 7, 1, 15999.00, 1, 'Confirmed', '2026-07-25', 'Dining table set'),
('INV-2026-0006', 2, 8, 2, 32999.00, 1, 'Confirmed', '2026-07-25', 'Dining table 6-seater'),
('INV-2026-0007', 7, 8, 2, 5999.00, 1, 'Draft', '2026-07-27', 'Office chair'),
('INV-2026-0008', 9, 9, 3, 12999.00, 1, 'Confirmed', '2026-07-26', 'Mattress queen'),
('INV-2026-0009', 11, 9, 3, 7999.00, 1, 'Confirmed', '2026-07-27', 'Garden bench');

-- ============================================================
-- SALES INVOICE ITEMS
-- ============================================================
INSERT INTO sales_invoice_items (invoices_id, product_id, quantity, unit_price, line_total) VALUES
(1, 1, 1, 24999.00, 24999.00),
(2, 2, 1, 8999.00, 8999.00),
(3, 3, 1, 18999.00, 18999.00),
(4, 4, 1, 18999.00, 18999.00),
(5, 2, 1, 15999.00, 15999.00),
(6, 4, 1, 32999.00, 32999.00),
(7, 5, 2, 5999.00, 11998.00),
(8, 7, 1, 12999.00, 12999.00),
(9, 6, 1, 7999.00, 7999.00);

-- ============================================================
-- COLLECTION PAYMENTS
-- ============================================================
INSERT INTO collection_payment (receipt_number, customer_id, collector_id, branch_id, amount, payment_method_id, payment_date, payment_time, status, notes) VALUES
('RCP-2026-0001', 1, 10, 1, 5000.00, 1, '2026-07-25', '10:30:00', 'Completed', 'Cash payment - partial'),
('RCP-2026-0002', 3, 10, 1, 3000.00, 1, '2026-07-26', '14:15:00', 'Completed', 'Cash payment - partial'),
('RCP-2026-0003', 2, 11, 2, 8000.00, 1, '2026-07-25', '09:45:00', 'Completed', 'Full settlement'),
('RCP-2026-0004', 9, 12, 3, 4500.00, 1, '2026-07-26', '11:20:00', 'Completed', 'Check payment'),
('RCP-2026-0005', 1, 10, 1, 7000.00, 1, '2026-07-27', '16:00:00', 'Completed', 'Cash payment - remaining balance'),
('RCP-2026-0006', 4, 11, 1, 2500.00, 1, '2026-07-27', '13:10:00', 'Pending', 'Awaiting verification');

-- ============================================================
-- SAW RESULTS
-- ============================================================
-- Collector/collection SAW priority only (no engine_type column after migration 025)
INSERT INTO saw_results (customer_id, engine_type, score, ranking) VALUES
(4, 'Collection', 0.8920, 1),
(1, 'Collection', 0.7650, 2),
(5, 'Collection', 0.6540, 3),
(3, 'Collection', 0.5430, 4),
(2, 'Collection', 0.9120, 1),
(8, 'Collection', 0.7210, 2),
(7, 'Collection', 0.6340, 3),
(11, 'Collection', 0.8780, 1),
(9, 'Collection', 0.7560, 2);

-- ============================================================
-- PERFORMANCE SUMMARY
-- ============================================================
INSERT INTO performance_summary (branch_id, total_sales, total_collections, inventory_accuracy) VALUES
(1, 52997.00, 14500.00, 94.50),
(2, 38998.00, 8000.00, 91.20),
(3, 20998.00, 4500.00, 88.75);

COMMIT;
