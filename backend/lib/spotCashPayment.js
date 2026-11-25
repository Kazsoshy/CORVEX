import { ApplyError } from './syncErrors.js';
import { AUDIT_STATUS, writeAuditLog } from './auditLog.js';
import { manilaNow } from './collectionPayment.js';

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function nextReceiptNumber(client) {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const found = await client.query(
    `SELECT receipt_number FROM collection_payment
     WHERE receipt_number LIKE $1
     ORDER BY collectionpayment_id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (found.rows.length) {
    const tail = found.rows[0].receipt_number.split('-').pop();
    seq = (Number(tail) || 0) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Record Spot Cash GCash settlement at Log Sale time.
 * Does not change customer outstanding (spot cash GCash is paid immediately;
 * invoice stays Pending Review for Branch Head document review).
 */
function normalizePaymentProof(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!raw.startsWith('data:image/')) {
    throw new ApplyError('Payment proof must be an uploaded or captured image.', 400);
  }
  if (raw.length > 6_000_000) {
    throw new ApplyError('Payment proof image is too large.', 400);
  }
  return raw;
}

export async function recordSpotCashGcashPayment(client, user, {
  invoiceId,
  customerId,
  amount,
  paymentMethodId,
  referenceNumber,
  paymentProofImage = null,
  generateReceipt = true,
  ipAddress = '127.0.0.1',
}) {
  const ref = String(referenceNumber || '').trim();
  if (!ref || ref.length < 6) {
    throw new ApplyError('A valid GCash reference number (at least 6 characters) is required.', 400);
  }
  const proof = normalizePaymentProof(paymentProofImage);
  const payAmount = money(amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new ApplyError('Spot Cash GCash amount must be greater than zero.', 400);
  }
  if (!user?.branchId) {
    throw new ApplyError('No branch assigned.', 403);
  }

  const dupRef = await client.query(
    `SELECT collectionpayment_id FROM collection_payment
     WHERE LOWER(COALESCE(reference_number, '')) = LOWER($1)
       AND status <> 'Cancelled'
     LIMIT 1`,
    [ref]
  );
  if (dupRef.rows.length) {
    throw new ApplyError('This GCash reference number has already been recorded.', 409);
  }

  const invoice = await client.query(
    `SELECT sales_invoices_id, invoice_number, customer_id, branch_id, total_amount,
            pay_type, payment_method_id, spot_cash_settlement, status
     FROM sales_invoices
     WHERE sales_invoices_id = $1
     FOR UPDATE`,
    [invoiceId]
  );
  if (!invoice.rows.length) {
    throw new ApplyError('Invoice not found for Spot Cash payment.', 404);
  }
  const inv = invoice.rows[0];
  if (Number(inv.customer_id) !== Number(customerId)) {
    throw new ApplyError('Invoice customer mismatch.', 400);
  }
  if (String(inv.pay_type || '').toLowerCase() !== 'full') {
    throw new ApplyError('GCash Spot Cash settlement applies only to Spot Cash invoices.', 400);
  }
  if (inv.spot_cash_settlement === 'gcash_recorded' || inv.spot_cash_settlement === 'collected') {
    throw new ApplyError('Payment is already recorded for this Spot Cash invoice.', 409);
  }

  const { date, time } = manilaNow();
  const receiptNumber = await nextReceiptNumber(client);
  const notes = `Spot Cash GCash · Invoice ${inv.invoice_number} · Ref: ${ref}`;

  const paymentInsert = await client.query(
    `INSERT INTO collection_payment (
       receipt_number, customer_id, collector_id, branch_id, amount,
       payment_method_id, payment_date, payment_time, status, notes, reference_number,
       payment_proof_image
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::time, 'Completed', $9, $10, $11)
     RETURNING collectionpayment_id, receipt_number, amount, payment_date::text AS payment_date,
               payment_time::text AS payment_time, status, reference_number, notes`,
    [
      receiptNumber,
      customerId,
      user.id,
      user.branchId,
      payAmount,
      paymentMethodId,
      date,
      time,
      proof ? `${notes} · Proof attached` : notes,
      ref,
      proof,
    ]
  );
  const payment = paymentInsert.rows[0];

  await client.query(
    `INSERT INTO credit_history (
       customer_id, sales_id, collection_id, previous_balance, payment_amount,
       remaining_balance, payment_status, transaction_date
     ) VALUES ($1, $2, $3, 0, $4, 0, 'Paid', $5::date)`,
    [customerId, invoiceId, payment.collectionpayment_id, payAmount, date]
  );

  let receiptsId = null;
  if (generateReceipt) {
    const receipt = await client.query(
      `INSERT INTO digital_receipts (collection_id, receipt_number, receipt_date, generated_by)
       VALUES ($1, $2, ($3::date + $4::time)::timestamp, $5)
       RETURNING receipts_id`,
      [payment.collectionpayment_id, receiptNumber, date, time, user.id]
    );
    receiptsId = receipt.rows[0].receipts_id;
  }

  await client.query(
    `UPDATE sales_invoices
     SET spot_cash_settlement = 'gcash_recorded',
         notes = CASE
           WHEN notes IS NULL OR BTRIM(notes) = '' THEN $2
           ELSE notes || E'\\n' || $2
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE sales_invoices_id = $1`,
    [invoiceId, `GCash payment recorded (${ref}). Receipt ${receiptNumber}.`]
  );

  const userRow = await client.query(
    `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email, 'User') AS name,
            (SELECT role_name FROM roles r WHERE r.role_id = users.role_id) AS role_name
     FROM users WHERE id = $1`,
    [user.id]
  );

  await writeAuditLog(client, {
    userId: user.id,
    userName: String(userRow.rows[0]?.name || 'User').slice(0, 150),
    roleName: userRow.rows[0]?.role_name || null,
    module: 'Sales',
    activity: 'Spot Cash GCash payment recorded',
    action: 'Spot Cash GCash payment recorded',
    description: `${inv.invoice_number} · ${receiptNumber} · Ref ${ref}`.slice(0, 150),
    status: AUDIT_STATUS.CREATED,
    ipAddress: ipAddress || '127.0.0.1',
    affectedRecord: `collection_payment:${payment.collectionpayment_id}`,
    branchId: user.branchId,
  });

  return {
    payment: { ...payment, payment_method: 'GCash' },
    receiptsId,
    settlement: 'gcash_recorded',
  };
}

/** Mark awaiting Spot Cash Cash invoices as collected after a successful collection. */
export async function markSpotCashCollectedForCustomer(client, customerId, paymentDate = null) {
  const date = paymentDate || manilaNow().date;
  await client.query(
    `UPDATE sales_invoices
     SET spot_cash_settlement = 'collected',
         notes = CASE
           WHEN notes IS NULL OR BTRIM(notes) = '' THEN $3
           ELSE notes || E'\\n' || $3
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE customer_id = $1
       AND spot_cash_settlement = 'awaiting_pickup'
       AND status IN ('Pending Review', 'Confirmed')
       AND COALESCE(due_date, invoices_date) <= $2::date`,
    [customerId, date, `Spot Cash Cash collected on ${date}.`]
  );
}
