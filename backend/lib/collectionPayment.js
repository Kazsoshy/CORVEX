import { ApplyError, SyncConflict } from './syncErrors.js';
import { AUDIT_STATUS, writeAuditLog } from './auditLog.js';

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function writePaymentAudit(client, userId, action, detail, ipAddress) {
  const userRow = await client.query(
    `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email, 'User') AS name,
            (SELECT role_name FROM roles r WHERE r.role_id = users.role_id) AS role_name
     FROM users WHERE id = $1`,
    [userId]
  );
  const userName = String(userRow.rows[0]?.name || 'User').slice(0, 150);
  const roleName = userRow.rows[0]?.role_name || null;
  const actionText = String(action || 'Payment Activity');
  const lower = actionText.toLowerCase();
  let status = AUDIT_STATUS.SUCCESS;
  if (lower.includes('create') || lower.includes('record')) status = AUDIT_STATUS.CREATED;
  else if (lower.includes('update') || lower.includes('modify') || lower.includes('edit')) status = AUDIT_STATUS.UPDATED;
  else if (lower.includes('delete') || lower.includes('void')) status = AUDIT_STATUS.DELETED;
  else if (lower.includes('archive')) status = AUDIT_STATUS.ARCHIVED;
  else if (lower.includes('restore')) status = AUDIT_STATUS.RESTORED;

  await writeAuditLog(client, {
    userId,
    userName,
    roleName,
    module: 'Collections and Payments',
    activity: actionText,
    action: actionText,
    description: String(detail || ''),
    status,
    ipAddress: ipAddress || '127.0.0.1',
    affectedRecord: null,
  });
}

function paymentAuditDetail(payment, sentence) {
  return `${payment.receipt_number} PHP ${money(payment.amount).toFixed(2)}. ${sentence}`.slice(0, 150);
}

export function manilaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

export async function assertCollectorCustomerAccess(pool, user, customerId) {
  const result = await pool.query(
    `SELECT customer_id, branch_id, first_name, last_name FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  if (!result.rows.length) return { ok: false, status: 404, message: 'Customer not found.' };
  const row = result.rows[0];
  if (user.branchId != null && row.branch_id !== user.branchId) {
    return { ok: false, status: 403, message: 'Customer is outside your branch.' };
  }
  return { ok: true, row };
}

/**
 * Collections may only be logged against a published Collection visit for this collector.
 * Directory browsing alone must not authorize a payment.
 */
export async function assertCollectorPublishedVisit(pool, user, customerId, visitId = null) {
  const todayRes = await pool.query(
    `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::text AS today`
  );
  const today = todayRes.rows[0]?.today;

  if (visitId != null && Number.isFinite(Number(visitId))) {
    const byId = await pool.query(
      `SELECT visit_id, customer_id, scheduled_date::text AS scheduled_date, status, visit_type
       FROM field_visits
       WHERE visit_id = $1
         AND user_id = $2
         AND visit_type = 'Collection'`,
      [Number(visitId), user.id]
    );
    if (!byId.rows.length) {
      return { ok: false, status: 403, message: 'Visit not found on your published route.' };
    }
    const visit = byId.rows[0];
    if (Number(visit.customer_id) !== Number(customerId)) {
      return { ok: false, status: 403, message: 'Visit does not match this customer.' };
    }
    if (String(visit.scheduled_date).slice(0, 10) !== String(today).slice(0, 10)) {
      return { ok: false, status: 403, message: 'Collections are only allowed for today\'s published route stops.' };
    }
    return { ok: true, visit };
  }

  const byCustomer = await pool.query(
    `SELECT visit_id, customer_id, scheduled_date::text AS scheduled_date, status, visit_type
     FROM field_visits
     WHERE customer_id = $1
       AND user_id = $2
       AND visit_type = 'Collection'
       AND scheduled_date = $3::date
     ORDER BY visit_id DESC
     LIMIT 1`,
    [customerId, user.id, today]
  );
  if (!byCustomer.rows.length) {
    return {
      ok: false,
      status: 403,
      message: 'This customer is not on your published route for today.',
    };
  }
  return { ok: true, visit: byCustomer.rows[0] };
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

const ALLOWED_COLLECTOR_METHODS = new Map([
  ['cash', 'Cash'],
  ['gcash', 'GCash'],
  ['mobile money', 'GCash'],
]);

function normalizeCollectorMethod(methodName) {
  const key = String(methodName || '').trim().toLowerCase();
  return ALLOWED_COLLECTOR_METHODS.get(key) || null;
}

async function resolvePaymentMethodId(client, methodName) {
  const canonical = normalizeCollectorMethod(methodName) || String(methodName || 'Cash').trim();
  const found = await client.query(
    `SELECT payment_method_id FROM payment_methods
     WHERE LOWER(method_name) = LOWER($1) AND status = 'Active' LIMIT 1`,
    [canonical]
  );
  if (found.rows.length) return found.rows[0].payment_method_id;
  const insert = await client.query(
    `INSERT INTO payment_methods (method_name, description, status)
     VALUES ($1, $2, 'Active')
     ON CONFLICT (method_name) DO UPDATE SET status = 'Active'
     RETURNING payment_method_id`,
    [canonical, `${canonical} payment`]
  );
  return insert.rows[0]?.payment_method_id || 1;
}

export async function applyCollectionPayment(client, user, body, ipAddress = '127.0.0.1') {
  if (user.roleSlug && user.roleSlug !== 'collector') {
    throw new ApplyError('Only a collector can sync a collection.', 403);
  }
  const customerId = Number(body.customer_id);
  const amount = money(body.amount);
  const generateReceipt = body.generate_receipt !== false;
  const rawNotes = body.notes ? String(body.notes).trim() : '';
  const canonicalMethod = normalizeCollectorMethod(body.payment_method);

  if (!Number.isFinite(customerId) || !Number.isFinite(amount) || amount <= 0) {
    throw new ApplyError('Valid customer_id and amount greater than zero are required.');
  }
  if (!canonicalMethod) {
    throw new ApplyError('Only Cash and GCash payment modes are accepted.', 400);
  }
  if (user.branchId == null) {
    throw new ApplyError('No branch assigned.', 403);
  }

  const rawRef = String(body.reference_number ?? body.gcash_reference ?? '').trim();
  if (canonicalMethod === 'GCash') {
    if (!rawRef || rawRef.length < 6) {
      throw new ApplyError('A valid GCash reference number (at least 6 characters) is required.', 400);
    }
    const dupRef = await client.query(
      `SELECT collectionpayment_id FROM collection_payment
       WHERE LOWER(COALESCE(reference_number, '')) = LOWER($1)
         AND status <> 'Cancelled'
       LIMIT 1`,
      [rawRef]
    );
    if (dupRef.rows.length) {
      throw new ApplyError('This GCash reference number has already been recorded.', 409);
    }
  }

  const access = await assertCollectorCustomerAccess(client, user, customerId);
  if (!access.ok) throw new ApplyError(access.message, access.status);

  const visitGate = await assertCollectorPublishedVisit(
    client,
    user,
    customerId,
    body.visit_id ?? body.visitId ?? null
  );
  if (!visitGate.ok) throw new ApplyError(visitGate.message, visitGate.status);

  // Prevent accidental rapid duplicate submissions for the same customer and amount
  const recentDup = await client.query(
    `SELECT collectionpayment_id, receipt_number
     FROM collection_payment
     WHERE collector_id = $1
       AND customer_id = $2
       AND amount = $3
       AND status <> 'Cancelled'
       AND created_at >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
     LIMIT 1`,
    [user.id, customerId, amount]
  );
  if (recentDup.rows.length) {
    throw new ApplyError(
      `Duplicate submission prevented: collection ${recentDup.rows[0].receipt_number} for this amount was just recorded.`,
      409
    );
  }

  const balRow = await client.query(
    `SELECT outstanding_balance FROM customer_activity WHERE customer_id = $1 FOR UPDATE`,
    [customerId]
  );
  const previousBalance = money(balRow.rows[0]?.outstanding_balance || 0);
  if (body.expected_balance != null && money(body.expected_balance) !== previousBalance) {
    throw new SyncConflict(
      `The outstanding balance changed from ${money(body.expected_balance)} to ${previousBalance} after this collection was saved on the device.`
    );
  }
  if (previousBalance <= 0) {
    throw new ApplyError('Customer has no outstanding balance to collect.');
  }
  if (amount > previousBalance) {
    throw new SyncConflict(`Amount exceeds outstanding balance (${previousBalance}).`);
  }

  const paymentMethodId = await resolvePaymentMethodId(client, canonicalMethod);
  const receiptNumber = await nextReceiptNumber(client);
  const { date, time } = manilaNow();
  const combinedNotes = [
    canonicalMethod === 'GCash' && rawRef ? `GCash Ref: ${rawRef}` : null,
    rawNotes || null,
  ]
    .filter(Boolean)
    .join(' · ') || null;

  const paymentInsert = await client.query(
    `INSERT INTO collection_payment (
       receipt_number, customer_id, collector_id, branch_id, amount,
       payment_method_id, payment_date, payment_time, status, notes, reference_number
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::time, 'Completed', $9, $10)
     RETURNING collectionpayment_id, receipt_number, amount, payment_date::text AS payment_date, payment_time::text AS payment_time, status, reference_number, notes`,
    [
      receiptNumber,
      customerId,
      user.id,
      user.branchId,
      amount,
      paymentMethodId,
      date,
      time,
      combinedNotes,
      canonicalMethod === 'GCash' ? rawRef : null,
    ]
  );
  const payment = paymentInsert.rows[0];
  const collectionId = payment.collectionpayment_id;

  const balances = await applyConfirmedCollection(client, {
    ...payment,
    customer_id: customerId,
    collector_id: user.id,
  });

  let receiptsId = null;
  if (generateReceipt) {
    const receipt = await client.query(
      `INSERT INTO digital_receipts (collection_id, receipt_number, receipt_date, generated_by)
       VALUES ($1, $2, ($3::date + $4::time)::timestamp, $5)
       RETURNING receipts_id`,
      [collectionId, receiptNumber, date, time, user.id]
    );
    receiptsId = receipt.rows[0].receipts_id;
  }

  await writePaymentAudit(
    client,
    user.id,
    'Collection recorded',
    paymentAuditDetail(payment, `Balance updated to PHP ${balances.remainingBalance.toFixed(2)}.`),
    ipAddress
  );

  return {
    kind: 'payment',
    payment: {
      ...payment,
      payment_method: canonicalMethod,
    },
    customerId,
    receiptsId,
    previousBalance: balances.previousBalance,
    remainingBalance: balances.remainingBalance,
    awaitingReview: false,
  };
}

async function lockReviewedCollection(client, paymentId, expectedStatus, scopedBranchId) {
  const params = [paymentId, expectedStatus];
  let branchSql = 'TRUE';
  if (scopedBranchId != null) {
    params.push(scopedBranchId);
    branchSql = `branch_id = $${params.length}`;
  }
  const existing = await client.query(
    `SELECT collectionpayment_id, receipt_number, customer_id, collector_id, branch_id,
            amount, payment_date::text AS payment_date, status
     FROM collection_payment
     WHERE collectionpayment_id = $1
       AND status = $2
       AND ${branchSql}
     FOR UPDATE`,
    params
  );
  return existing.rows[0] || null;
}

async function recordAllocatedCredit(client, payment, previousBalance, amount) {
  const open = await client.query(
    `SELECT si.sales_invoices_id,
            si.total_amount::float AS total_amount,
            COALESCE(paid.paid, 0)::float AS paid
     FROM sales_invoices si
     LEFT JOIN (
       SELECT sales_id, SUM(payment_amount) AS paid
       FROM credit_history
       WHERE sales_id IS NOT NULL
       GROUP BY sales_id
     ) paid ON paid.sales_id = si.sales_invoices_id
     WHERE si.customer_id = $1
       AND si.status IN ('Confirmed', 'Pending Review')
       AND si.due_date IS NOT NULL
       AND COALESCE(paid.paid, 0) < si.total_amount
     ORDER BY si.due_date ASC, si.sales_invoices_id ASC
     FOR UPDATE OF si`,
    [payment.customer_id]
  );

  const slices = [];
  let left = money(amount);
  for (const invoice of open.rows) {
    if (left <= 0) break;
    const unpaid = money(Number(invoice.total_amount) - Number(invoice.paid));
    if (unpaid <= 0) continue;
    const slice = money(Math.min(left, unpaid));
    slices.push({ salesId: invoice.sales_invoices_id, amount: slice });
    left = money(left - slice);
  }
  if (left > 0) slices.push({ salesId: null, amount: left });

  let running = money(previousBalance);
  for (const slice of slices) {
    const remaining = Math.max(0, money(running - slice.amount));
    await client.query(
      `INSERT INTO credit_history (
         customer_id, sales_id, collection_id, previous_balance, payment_amount,
         remaining_balance, payment_status, transaction_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date)`,
      [
        payment.customer_id,
        slice.salesId,
        payment.collectionpayment_id,
        running,
        slice.amount,
        remaining,
        remaining === 0 ? 'Paid' : 'Partial',
        payment.payment_date,
      ]
    );
    running = remaining;
  }
}

async function applyConfirmedCollection(client, payment) {
  const amount = money(payment.amount);
  const balRow = await client.query(
    `SELECT outstanding_balance FROM customer_activity WHERE customer_id = $1 FOR UPDATE`,
    [payment.customer_id]
  );
  const previousBalance = money(balRow.rows[0]?.outstanding_balance || 0);
  if (previousBalance <= 0) {
    throw new ApplyError('Customer has no outstanding balance to collect.', 409);
  }
  if (amount > previousBalance) {
    throw new SyncConflict(`Amount exceeds outstanding balance (${money(previousBalance)}).`);
  }
  const remainingBalance = Math.max(0, money(previousBalance - amount));
  if (balRow.rows.length) {
    await client.query(
      `UPDATE customer_activity
       SET outstanding_balance = $1, last_collection_date = $2::date, updated_at = NOW()
       WHERE customer_id = $3`,
      [remainingBalance, payment.payment_date, payment.customer_id]
    );
  } else {
    await client.query(
      `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_collection_date)
       VALUES ($1, $2, 0, $3::date)`,
      [payment.customer_id, remainingBalance, payment.payment_date]
    );
  }
  await recordAllocatedCredit(client, payment, previousBalance, amount);
  try {
    await client.query(
      `UPDATE field_visits
       SET status = 'Completed',
           visit_outcome = 'Collected',
           visited_at = COALESCE(visited_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND customer_id = $2
         AND scheduled_date <= CURRENT_DATE
         AND (status <> 'Completed' OR visit_outcome IS DISTINCT FROM 'Collected')`,
      [payment.collector_id, payment.customer_id]
    );
  } catch {
    await client.query(
      `UPDATE field_visits
       SET status = 'Completed'
       WHERE user_id = $1 AND customer_id = $2
         AND scheduled_date <= CURRENT_DATE
         AND status <> 'Completed'`,
      [payment.collector_id, payment.customer_id]
    );
  }
  return { previousBalance, remainingBalance };
}

export async function confirmCollectionPayment(client, reviewer, paymentId, scopedBranchId, reviewNote, ipAddress = '127.0.0.1') {
  const payment = await lockReviewedCollection(client, paymentId, 'Pending', scopedBranchId);
  if (!payment) {
    throw new ApplyError('Collection is not waiting for review in your branch.', 404);
  }
  const balances = await applyConfirmedCollection(client, payment);
  const updated = await client.query(
    `UPDATE collection_payment
     SET status = 'Completed', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, review_note = $3
     WHERE collectionpayment_id = $1
     RETURNING collectionpayment_id, receipt_number, amount, status`,
    [paymentId, reviewer.id, reviewNote || null]
  );
  await writePaymentAudit(
    client,
    reviewer.id,
    'Collection confirmed',
    paymentAuditDetail(updated.rows[0], 'Balance updated.'),
    ipAddress
  );
  return {
    payment: updated.rows[0],
    customerId: payment.customer_id,
    remainingBalance: balances.remainingBalance,
  };
}

export async function rejectCollectionPayment(client, reviewer, paymentId, scopedBranchId, reviewNote, ipAddress = '127.0.0.1') {
  const reason = String(reviewNote || '').trim();
  if (!reason) throw new ApplyError('A rejection reason is required.');
  const payment = await lockReviewedCollection(client, paymentId, 'Pending', scopedBranchId);
  if (!payment) {
    throw new ApplyError('Collection is not waiting for review in your branch.', 404);
  }
  const updated = await client.query(
    `UPDATE collection_payment
     SET status = 'Cancelled', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, review_note = $3
     WHERE collectionpayment_id = $1
     RETURNING collectionpayment_id, receipt_number, amount, status`,
    [paymentId, reviewer.id, reason]
  );
  await writePaymentAudit(
    client,
    reviewer.id,
    'Collection rejected',
    paymentAuditDetail(updated.rows[0], 'Balance unchanged.'),
    ipAddress
  );
  return { payment: updated.rows[0], customerId: payment.customer_id };
}

export async function reverseCollectionPayment(client, reviewer, paymentId, scopedBranchId, reviewNote, ipAddress = '127.0.0.1') {
  const reason = String(reviewNote || '').trim();
  if (!reason) throw new ApplyError('A reversal reason is required.');
  const payment = await lockReviewedCollection(client, paymentId, 'Completed', scopedBranchId);
  if (!payment) {
    throw new ApplyError('Only a confirmed collection in your branch can be reversed.', 404);
  }
  const amount = money(payment.amount);
  const balRow = await client.query(
    `SELECT outstanding_balance FROM customer_activity WHERE customer_id = $1 FOR UPDATE`,
    [payment.customer_id]
  );
  const previousBalance = money(balRow.rows[0]?.outstanding_balance || 0);
  const restoredBalance = money(previousBalance + amount);
  if (balRow.rows.length) {
    await client.query(
      `UPDATE customer_activity
       SET outstanding_balance = $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [restoredBalance, payment.customer_id]
    );
  } else {
    await client.query(
      `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume)
       VALUES ($1, $2, 0)`,
      [payment.customer_id, restoredBalance]
    );
  }
  await client.query(`DELETE FROM credit_history WHERE collection_id = $1`, [paymentId]);
  const updated = await client.query(
    `UPDATE collection_payment
     SET status = 'Cancelled', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, review_note = $3
     WHERE collectionpayment_id = $1
     RETURNING collectionpayment_id, receipt_number, amount, status`,
    [paymentId, reviewer.id, reason]
  );
  await writePaymentAudit(
    client,
    reviewer.id,
    'Collection reversed',
    paymentAuditDetail(updated.rows[0], 'Amount returned to the balance.'),
    ipAddress
  );
  return {
    payment: updated.rows[0],
    customerId: payment.customer_id,
    remainingBalance: restoredBalance,
  };
}
