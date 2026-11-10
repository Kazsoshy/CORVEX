/**
 * Shared customer payment-standing helpers.
 * Standing must match Sales / Collector / BM / Reports / KPI surfaces:
 *   Current | Overdue | Has Balance
 *
 * Authoritative overdue definition (OVERDUE_CUSTOMER / hasOverdueInvoice):
 *   At least one Confirmed/Pending Review invoice with unpaid balance and due_date
 *   before the as-of Manila calendar date.
 *
 * last_collection_date must NOT independently determine overdue status.
 */

/** SQL EXISTS fragment; alias the customers table as `c`. */
export const OVERDUE_CUSTOMER_SQL = `EXISTS (
  SELECT 1
  FROM sales_invoices si
  LEFT JOIN (
    SELECT sales_id, SUM(payment_amount) AS paid
    FROM credit_history
    WHERE sales_id IS NOT NULL
    GROUP BY sales_id
  ) paid ON paid.sales_id = si.sales_invoices_id
  WHERE si.customer_id = c.customer_id
    AND si.status IN ('Confirmed', 'Pending Review')
    AND si.due_date IS NOT NULL
    AND si.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
    AND COALESCE(paid.paid, 0) < si.total_amount
)`;

/** Boolean SELECT expression usable in SELECT lists (customers alias `c`). */
export const HAS_OVERDUE_INVOICE_SELECT = `(${OVERDUE_CUSTOMER_SQL}) AS has_overdue_invoice`;

/**
 * Point-in-time overdue: unpaid past-due invoice as of a Manila calendar date parameter.
 * @param {number} asOfParamIndex - 1-based SQL parameter index for the as-of date.
 */
export function overdueCustomerAsOfSql(asOfParamIndex) {
  const p = `$${asOfParamIndex}`;
  return `EXISTS (
  SELECT 1
  FROM sales_invoices si
  LEFT JOIN (
    SELECT sales_id, SUM(payment_amount) AS paid
    FROM credit_history
    WHERE sales_id IS NOT NULL
      AND transaction_date <= ${p}::date
    GROUP BY sales_id
  ) paid ON paid.sales_id = si.sales_invoices_id
  WHERE si.customer_id = c.customer_id
    AND si.status IN ('Confirmed', 'Pending Review')
    AND si.due_date IS NOT NULL
    AND si.due_date < ${p}::date
    AND COALESCE(si.invoices_date, si.due_date) <= ${p}::date
    AND COALESCE(paid.paid, 0) < si.total_amount
)`;
}

/**
 * @param {{ outstandingBalance?: number, hasOverdueInvoice?: boolean }} input
 * @returns {'Current'|'Overdue'|'Has Balance'}
 */
export function paymentStandingFromFlags({ outstandingBalance = 0, hasOverdueInvoice = false } = {}) {
  const balance = Number(outstandingBalance) || 0;
  if (balance <= 0) return 'Current';
  if (hasOverdueInvoice) return 'Overdue';
  return 'Has Balance';
}
