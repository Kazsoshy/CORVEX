-- ============================================================
-- CORVEX — Migration 019: Seed digital_receipts
-- Creates one digital receipt per existing collection_payment row,
-- linking collection_id, reusing the receipt_number from the payment,
-- and setting generated_by to the collector who made the payment.
-- Safe to re-run: WHERE NOT EXISTS guard on collection_id.
-- ============================================================

BEGIN;

INSERT INTO digital_receipts (
    collection_id,
    receipt_number,
    receipt_date,
    generated_by
)
SELECT
    cp.collectionpayment_id,
    cp.receipt_number,
    -- combine payment_date with payment_time into a timestamp
    (cp.payment_date::DATE + COALESCE(cp.payment_time, '08:00:00'::TIME))::TIMESTAMP,
    cp.collector_id
FROM collection_payment cp
WHERE NOT EXISTS (
    SELECT 1 FROM digital_receipts dr
    WHERE dr.collection_id = cp.collectionpayment_id
);

COMMIT;
