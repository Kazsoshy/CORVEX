-- ============================================================
-- CORVEX — Migration 018: Seed credit_history
-- Derives records from existing collection_payment rows so the
-- table reflects actual transaction data already in the DB.
--
-- Logic:
--   - Each completed/pending collection_payment becomes one
--     credit_history row.
--   - previous_balance  = customer's outstanding_balance BEFORE
--     the payment (approximated as remaining_balance + payment_amount)
--   - payment_amount    = collection_payment.amount
--   - remaining_balance = previous_balance - payment_amount
--     (floored at 0 to avoid negatives)
--   - payment_status:
--       remaining_balance = 0             → 'Paid'
--       remaining_balance > 0             → 'Partial'
--       collection_payment.status = 'Pending' AND date < today → 'Overdue'
--   - sales_id linked where a sales invoice exists for the same
--     customer near the payment date (within 30 days prior).
-- Safe to re-run: uses WHERE NOT EXISTS guard on collection_id.
-- ============================================================

BEGIN;

INSERT INTO credit_history (
    customer_id,
    sales_id,
    collection_id,
    previous_balance,
    payment_amount,
    remaining_balance,
    payment_status,
    transaction_date
)
SELECT
    cp.customer_id,

    -- Link to nearest sales invoice for same customer within 30 days before payment
    (
        SELECT si.sales_invoices_id
        FROM sales_invoices si
        WHERE si.customer_id = cp.customer_id
          AND si.invoices_date BETWEEN (cp.payment_date - INTERVAL '30 days')::DATE
                                   AND cp.payment_date
        ORDER BY si.invoices_date DESC
        LIMIT 1
    ) AS sales_id,

    cp.collectionpayment_id AS collection_id,

    -- Approximate previous balance from customer_activity outstanding + this payment
    ROUND(
        COALESCE(
            (SELECT ca.outstanding_balance FROM customer_activity ca
             WHERE ca.customer_id = cp.customer_id),
            0
        ) + cp.amount,
        2
    ) AS previous_balance,

    cp.amount AS payment_amount,

    -- remaining = previous - payment, floored at 0
    GREATEST(
        0,
        ROUND(
            COALESCE(
                (SELECT ca.outstanding_balance FROM customer_activity ca
                 WHERE ca.customer_id = cp.customer_id),
                0
            ),
            2
        )
    ) AS remaining_balance,

    -- Derive status
    CASE
        WHEN cp.status = 'Pending' AND cp.payment_date < CURRENT_DATE
            THEN 'Overdue'
        WHEN GREATEST(0,
            COALESCE(
                (SELECT ca.outstanding_balance FROM customer_activity ca
                 WHERE ca.customer_id = cp.customer_id),
                0
            )
        ) = 0
            THEN 'Paid'
        ELSE 'Partial'
    END AS payment_status,

    cp.payment_date AS transaction_date

FROM collection_payment cp
WHERE NOT EXISTS (
    SELECT 1 FROM credit_history ch
    WHERE ch.collection_id = cp.collectionpayment_id
);

COMMIT;
