const INVOICE_SELECT = `
  SELECT
    si.sales_invoices_id,
    si.invoice_number,
    si.invoices_date::text AS invoices_date,
    si.due_date::text AS due_date,
    si.first_due_date::text AS first_due_date,
    si.pay_type,
    si.term_months,
    si.monthly_amount,
    si.down_payment,
    si.total_amount,
    si.status AS workflow_status,
    si.notes,
    COALESCE(paid.amount_paid, 0) AS amount_paid,
    GREATEST(si.total_amount - COALESCE(paid.amount_paid, 0), 0) AS remaining_balance,
    pm.method_name AS payment_method,
    CURRENT_DATE::text AS as_of,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', agent.first_name, agent.last_name)), ''),
      'Sales agent'
    ) AS sales_agent_name,
    (
      SELECT string_agg(p.name || ' × ' || sii.quantity, ', ' ORDER BY p.name)
      FROM sales_invoice_items sii
      JOIN products p ON p.id = sii.product_id
      WHERE sii.invoices_id = si.sales_invoices_id
    ) AS products_summary,
    CASE
      WHEN si.status = 'Cancelled' THEN 'Cancelled'
      WHEN si.status <> 'Confirmed' THEN si.status
      WHEN COALESCE(paid.amount_paid, 0) >= si.total_amount THEN 'Paid'
      WHEN COALESCE(si.due_date, si.first_due_date) IS NOT NULL
           AND COALESCE(si.due_date, si.first_due_date) < CURRENT_DATE THEN 'Overdue'
      WHEN COALESCE(paid.amount_paid, 0) > 0 THEN 'Partial'
      ELSE 'Unpaid'
    END AS payment_status
  FROM sales_invoices si
  LEFT JOIN users agent ON agent.id = si.sales_agent_id
  LEFT JOIN payment_methods pm ON pm.payment_method_id = si.payment_method_id
  LEFT JOIN (
    SELECT sales_id, SUM(payment_amount) AS amount_paid
    FROM credit_history
    WHERE sales_id IS NOT NULL
    GROUP BY sales_id
  ) paid ON paid.sales_id = si.sales_invoices_id
`;

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isoDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function formatCompleteAddress(row) {
  const parts = [
    row.address_street,
    row.address_barangay,
    row.address_city,
    row.address_province,
    row.address_region,
    row.address_zip,
  ].map((part) => String(part || '').trim()).filter(Boolean);
  if (parts.length) return parts.join(', ');
  return String(row.address || '').trim();
}

export function customerPaymentStatus(invoice, today) {
  const workflow = invoice.workflow_status;
  if (workflow === 'Cancelled') return 'Cancelled';
  if (workflow && workflow !== 'Confirmed') return workflow;
  if (money(invoice.remaining_balance) <= 0) return 'Paid';
  if (invoice.next_due_date && today && invoice.next_due_date < today) return 'Overdue';
  if (money(invoice.amount_paid) > 0) return 'Partial';
  return 'Unpaid';
}

export function nextOpenDueDate(invoice) {
  const remaining = money(invoice.remaining_balance);
  if (remaining <= 0) return null;
  const fullDue = isoDate(invoice.due_date);
  const firstDue = isoDate(invoice.first_due_date);
  if (invoice.pay_type !== 'installment' || !firstDue || !Number(invoice.monthly_amount) || !Number(invoice.term_months)) {
    return fullDue || firstDue;
  }
  const monthly = money(invoice.monthly_amount);
  const covered = Math.max(0, money(invoice.amount_paid) - money(invoice.down_payment));
  const paidMonths = monthly > 0 ? Math.floor(covered / monthly) : 0;
  const index = Math.min(Math.max(paidMonths, 0), Number(invoice.term_months) - 1);
  const due = new Date(`${firstDue}T00:00:00`);
  due.setMonth(due.getMonth() + index);
  const month = String(due.getMonth() + 1).padStart(2, '0');
  const day = String(due.getDate()).padStart(2, '0');
  return `${due.getFullYear()}-${month}-${day}`;
}

function mapInvoice(row) {
  const invoice = {
    sales_invoices_id: row.sales_invoices_id,
    invoice_number: row.invoice_number,
    invoices_date: isoDate(row.invoices_date),
    due_date: isoDate(row.due_date),
    first_due_date: isoDate(row.first_due_date),
    pay_type: row.pay_type || 'full',
    term_months: row.term_months == null ? null : Number(row.term_months),
    monthly_amount: money(row.monthly_amount),
    down_payment: money(row.down_payment),
    total_amount: money(row.total_amount),
    amount_paid: money(row.amount_paid),
    remaining_balance: money(row.remaining_balance),
    workflow_status: row.workflow_status,
    payment_status: row.payment_status,
    sales_agent_name: row.sales_agent_name,
    products_summary: row.products_summary || '',
    notes: row.notes || '',
    payment_method: row.payment_method || '',
  };
  invoice.next_due_date = nextOpenDueDate(invoice);
  invoice.payment_status = customerPaymentStatus(invoice, isoDate(row.as_of));
  return invoice;
}

export async function listCustomerInvoices(pool, customerId) {
  const result = await pool.query(
    `${INVOICE_SELECT}
     WHERE si.customer_id = $1
     ORDER BY si.invoices_date DESC, si.sales_invoices_id DESC`,
    [customerId]
  );
  return result.rows.map(mapInvoice);
}

export async function getCustomerInvoice(pool, customerId, invoiceId) {
  const result = await pool.query(
    `${INVOICE_SELECT}
     WHERE si.customer_id = $1 AND si.sales_invoices_id = $2`,
    [customerId, invoiceId]
  );
  if (!result.rows.length) return null;
  const invoice = mapInvoice(result.rows[0]);
  const items = await pool.query(
    `SELECT sii.sales_invoices_items_id, sii.quantity, sii.unit_price, sii.line_total,
            p.name AS product_name, p.sku
     FROM sales_invoice_items sii
     JOIN products p ON p.id = sii.product_id
     WHERE sii.invoices_id = $1
     ORDER BY sii.sales_invoices_items_id`,
    [invoiceId]
  );
  invoice.items = items.rows.map((item) => ({
    item_id: item.sales_invoices_items_id,
    product_name: item.product_name,
    sku: item.sku,
    quantity: Number(item.quantity),
    unit_price: money(item.unit_price),
    line_total: money(item.line_total),
  }));
  return invoice;
}

function openInvoices(invoices) {
  return invoices.filter((invoice) => (
    invoice.workflow_status === 'Confirmed'
    && ['Unpaid', 'Partial', 'Overdue'].includes(invoice.payment_status)
  ));
}

export async function loadCustomerDashboard(pool, customer) {
  const [invoices, paid, recentPayments, todayRow] = await Promise.all([
    listCustomerInvoices(pool, customer.customer_id),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM collection_payment
       WHERE customer_id = $1 AND status = 'Completed'`,
      [customer.customer_id]
    ),
    pool.query(
      `SELECT cp.collectionpayment_id, cp.receipt_number, cp.amount,
              cp.payment_date::text AS payment_date, cp.status,
              pm.method_name AS payment_method
       FROM collection_payment cp
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       WHERE cp.customer_id = $1 AND cp.status <> 'Cancelled'
       ORDER BY cp.payment_date DESC, cp.collectionpayment_id DESC
       LIMIT 8`,
      [customer.customer_id]
    ),
    pool.query(`SELECT CURRENT_DATE::text AS today`),
  ]);

  const today = isoDate(todayRow.rows[0]?.today);
  const open = openInvoices(invoices);
  const upcoming = open
    .filter((invoice) => invoice.next_due_date && (!today || invoice.next_due_date >= today))
    .sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date)))
    .slice(0, 5)
    .map((invoice) => ({
      sales_invoices_id: invoice.sales_invoices_id,
      invoice_number: invoice.invoice_number,
      next_due_date: invoice.next_due_date,
      remaining_balance: invoice.remaining_balance,
      payment_status: invoice.payment_status,
      pay_type: invoice.pay_type,
      term_months: invoice.term_months,
      monthly_amount: invoice.monthly_amount,
      down_payment: invoice.down_payment,
    }));

  const transactions = [
    ...invoices
      .filter((invoice) => invoice.workflow_status === 'Confirmed')
      .slice(0, 6)
      .map((invoice) => ({
        id: `invoice-${invoice.sales_invoices_id}`,
        kind: 'Invoice',
        date: invoice.invoices_date,
        reference: invoice.invoice_number,
        amount: invoice.total_amount,
        detail: invoice.payment_status,
      })),
    ...recentPayments.rows.map((payment) => ({
      id: `payment-${payment.collectionpayment_id}`,
      kind: 'Payment',
      date: isoDate(payment.payment_date),
      reference: payment.receipt_number,
      amount: money(payment.amount),
      detail: payment.status === 'Completed' ? (payment.payment_method || 'Payment') : 'Waiting for confirmation',
    })),
  ]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 8);

  return {
    outstanding_balance: money(customer.outstanding_balance),
    total_purchases: money(customer.purchase_volume),
    total_payments: money(paid.rows[0]?.total_paid),
    active_unpaid_invoices: open.length,
    account_status: customer.status || 'Active',
    recent_transactions: transactions,
    upcoming_dues: upcoming,
  };
}

export function summarizeBalances(invoices, outstandingBalance) {
  const open = openInvoices(invoices);
  const groups = { Unpaid: [], Partial: [], Overdue: [] };
  open.forEach((invoice) => {
    if (groups[invoice.payment_status]) groups[invoice.payment_status].push(invoice);
  });
  return {
    outstanding_balance: money(outstandingBalance),
    unpaid: groups.Unpaid,
    partial: groups.Partial,
    overdue: groups.Overdue,
  };
}
