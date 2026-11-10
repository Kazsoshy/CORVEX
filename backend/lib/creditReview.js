/**
 * Credit Review helpers — snapshot, risk assessment, BM decision persistence.
 * Reuses credit_investigations + customer_credit_info (canonical limit).
 */

export const CREDIT_REVIEW_REASONS = [
  'First installment',
  'Need higher limit',
  'Customer over limit but wants another sale',
  'Other',
];

export const CREDIT_REVIEW_RISK_LEVELS = ['Low', 'Medium', 'High'];

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Build live financial evidence for a customer (used at request time + live BM compare).
 */
export async function buildCustomerCreditEvidence(client, customerId) {
  const customerRes = await client.query(
    `SELECT c.customer_id, c.customer_code, c.first_name, c.middle_name, c.last_name,
            c.status, c.id_verification_status, c.id_type, c.id_number,
            c.contact_phone, c.branch_id, b.name AS branch_name,
            COALESCE(ca.outstanding_balance, 0) AS outstanding_balance,
            ca.last_collection_date, ca.last_sales_visit,
            cci.credit_limit, cci.monthly_income, cci.employment_status, cci.credit_score,
            cci.approved_by, cci.approved_date,
            apv.full_name AS credit_approved_by_name
     FROM customers c
     LEFT JOIN branches b ON b.id = c.branch_id
     LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
     LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
     LEFT JOIN users apv ON apv.id = cci.approved_by
     WHERE c.customer_id = $1`,
    [customerId]
  );

  if (!customerRes.rows.length) {
    return null;
  }

  const customer = customerRes.rows[0];
  const outstanding = money(customer.outstanding_balance);
  const creditLimit = customer.credit_limit == null ? null : money(customer.credit_limit);
  const hasLimit = creditLimit != null && creditLimit > 0;
  const remaining = hasLimit ? Math.max(0, creditLimit - outstanding) : null;
  const utilization = hasLimit ? Math.round((outstanding / creditLimit) * 1000) / 10 : null;

  const paymentsRes = await client.query(
    `SELECT ch.credit_id,
            ch.payment_amount AS amount,
            ch.remaining_balance,
            ch.payment_status,
            ch.transaction_date AS payment_date,
            ch.collection_id,
            cp.receipt_number,
            cp.notes AS collection_notes,
            pm.method_name AS payment_method,
            si.invoice_number,
            CASE
              WHEN ch.remaining_balance > 0
                AND si.due_date IS NOT NULL
                AND si.due_date < CURRENT_DATE
              THEN 'Overdue'
              WHEN ch.remaining_balance <= 0 THEN 'Paid'
              WHEN ch.payment_status = 'Paid' AND ch.remaining_balance > 0 THEN 'Partial'
              ELSE ch.payment_status
            END AS display_status
     FROM credit_history ch
     LEFT JOIN collection_payment cp ON cp.collectionpayment_id = ch.collection_id
     LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
     LEFT JOIN sales_invoices si ON si.sales_invoices_id = ch.sales_id
     WHERE ch.customer_id = $1
     ORDER BY ch.transaction_date DESC, ch.credit_id DESC
     LIMIT 12`,
    [customerId]
  );

  const invoicesRes = await client.query(
    `SELECT si.sales_invoices_id, si.invoice_number, si.total_amount, si.status, si.invoices_date, si.due_date,
            si.pay_type, si.down_payment, si.term_months, si.monthly_amount, si.first_due_date,
            COALESCE((
              SELECT SUM(ch.payment_amount) FROM credit_history ch WHERE ch.sales_id = si.sales_invoices_id
            ), 0)::float AS amount_paid,
            COALESCE((
              SELECT ch.remaining_balance
              FROM credit_history ch
              WHERE ch.sales_id = si.sales_invoices_id
              ORDER BY ch.transaction_date DESC, ch.credit_id DESC
              LIMIT 1
            ), si.total_amount)::float AS remaining_balance
     FROM sales_invoices si
     WHERE si.customer_id = $1
       AND si.status NOT IN ('Cancelled', 'Draft')
     ORDER BY si.invoices_date DESC, si.sales_invoices_id DESC
     LIMIT 20`,
    [customerId]
  );

  const openInvoices = invoicesRes.rows.filter((row) => {
    const status = String(row.status || '');
    return !['Paid', 'Completed', 'Cancelled', 'Draft'].includes(status);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueInvoices = openInvoices.filter((row) => {
    if (!row.due_date) return false;
    const due = new Date(row.due_date);
    due.setHours(0, 0, 0, 0);
    return due < today;
  });

  const previousDecisionsRes = await client.query(
    `SELECT ci_id, status, purpose, request_reason, requested_credit_limit, approved_credit_limit,
            risk_level, rejection_reason, decision_remarks, created_at, decided_at, updated_at,
            apv.full_name AS decided_by_name
     FROM credit_investigations ci
     LEFT JOIN users apv ON apv.id = ci.approved_by
     WHERE ci.customer_id = $1
       AND ci.status IN ('Approved', 'Rejected', 'Revision Requested')
     ORDER BY COALESCE(ci.decided_at, ci.updated_at, ci.created_at) DESC
     LIMIT 8`,
    [customerId]
  );

  const pendingRes = await client.query(
    `SELECT ci_id, status, request_reason, purpose, requested_credit_limit, risk_level, created_at
     FROM credit_investigations
     WHERE customer_id = $1 AND status IN ('Pending', 'Revision Requested')
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId]
  );

  let creditStatus = 'No Credit';
  if (hasLimit) {
    creditStatus = outstanding > creditLimit ? 'Over Limit' : 'Has Limit';
  }

  const paymentHistory = paymentsRes.rows.map((row) => ({
    credit_id: row.credit_id,
    collection_id: row.collection_id,
    amount: money(row.amount),
    remaining_balance: money(row.remaining_balance),
    payment_date: row.payment_date,
    status: row.display_status || row.payment_status,
    payment_status: row.display_status || row.payment_status,
    receipt_number: row.receipt_number || null,
    invoice_number: row.invoice_number || null,
    reference_number: row.receipt_number || row.invoice_number || null,
    payment_method: row.payment_method || null,
    collection_notes: row.collection_notes || null,
  }));

  const evidence = {
    customer: {
      customer_id: customer.customer_id,
      customer_code: customer.customer_code || null,
      name: [customer.first_name, customer.middle_name, customer.last_name].filter(Boolean).join(' '),
      status: customer.status || 'Active',
      id_verification_status: customer.id_verification_status || 'Unverified',
      id_type: customer.id_type || null,
      contact_phone: customer.contact_phone || null,
      branch_name: customer.branch_name || null,
      credit_status: creditStatus,
    },
    financial: {
      outstanding_balance: outstanding,
      credit_limit: hasLimit ? creditLimit : null,
      remaining_credit: remaining,
      utilization_pct: utilization,
      monthly_income: customer.monthly_income != null ? money(customer.monthly_income) : null,
      employment_status: customer.employment_status || null,
      credit_score: customer.credit_score != null ? Number(customer.credit_score) : null,
      credit_approved_by: customer.credit_approved_by_name || null,
      credit_approved_date: customer.approved_date || null,
      last_collection_date: customer.last_collection_date || null,
      last_sales_visit: customer.last_sales_visit || null,
      payment_history: paymentHistory,
      open_invoices: openInvoices.map((row) => ({
        sales_invoices_id: row.sales_invoices_id,
        invoice_number: row.invoice_number,
        total_amount: money(row.total_amount),
        amount_paid: money(row.amount_paid),
        remaining_balance: money(row.remaining_balance),
        status: row.status,
        invoices_date: row.invoices_date,
        due_date: row.due_date,
        pay_type: row.pay_type,
        term_months: row.term_months,
      })),
      overdue_invoices: overdueInvoices.map((row) => ({
        invoice_number: row.invoice_number,
        total_amount: money(row.total_amount),
        amount_paid: money(row.amount_paid),
        remaining_balance: money(row.remaining_balance),
        status: row.status,
        due_date: row.due_date,
      })),
      overdue_count: overdueInvoices.length,
      overdue_amount: money(overdueInvoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)),
    },
    previous_decisions: previousDecisionsRes.rows.map((row) => ({
      ci_id: row.ci_id,
      status: row.status,
      reason: row.request_reason || row.purpose || null,
      requested_credit_limit: row.requested_credit_limit != null ? money(row.requested_credit_limit) : null,
      approved_credit_limit: row.approved_credit_limit != null ? money(row.approved_credit_limit) : null,
      risk_level: row.risk_level || null,
      rejection_reason: row.rejection_reason || null,
      decision_remarks: row.decision_remarks || null,
      decided_by: row.decided_by_name || null,
      decided_at: row.decided_at || row.updated_at || null,
      created_at: row.created_at,
    })),
    pending_review: pendingRes.rows[0] || null,
  };

  const risk = assessCreditRisk(evidence);
  evidence.risk = risk;
  evidence.suggestion = buildLimitSuggestion(evidence, risk);

  return evidence;
}

/**
 * Transparent rule-based risk. Returns { level, score, reasons[] }.
 */
export function assessCreditRisk(evidence) {
  const financial = evidence?.financial || {};
  const customer = evidence?.customer || {};
  const reasons = [];
  let score = 20;

  const outstanding = money(financial.outstanding_balance);
  const creditLimit = financial.credit_limit;
  const hasLimit = creditLimit != null && creditLimit > 0;
  const utilization = financial.utilization_pct;
  const overdueCount = Number(financial.overdue_count || 0);
  const overdueAmount = money(financial.overdue_amount);
  const payments = Array.isArray(financial.payment_history) ? financial.payment_history : [];
  const completedPayments = payments.filter((p) => {
    const status = String(p.status || p.payment_status || '');
    return status === 'Paid' || status === 'Partial' || status === 'Completed';
  });

  if (String(customer.status || '') === 'Inactive') {
    score += 35;
    reasons.push('Account status is Inactive.');
  }

  const kyc = String(customer.id_verification_status || 'Unverified');
  if (kyc === 'Unverified') {
    score += 15;
    reasons.push('ID / KYC is still Unverified.');
  } else if (kyc === 'Pending Review') {
    score += 8;
    reasons.push('ID / KYC is Pending Review.');
  } else {
    score -= 5;
    reasons.push('ID / KYC is Verified.');
  }

  if (!hasLimit) {
    score += 20;
    reasons.push('No approved credit limit on file.');
  } else if (outstanding > creditLimit) {
    score += 30;
    reasons.push(`Outstanding balance exceeds the ₱${creditLimit.toLocaleString('en-PH', { minimumFractionDigits: 2 })} limit.`);
  } else if (utilization != null && utilization >= 90) {
    score += 22;
    reasons.push(`Credit utilization is high (${utilization}%).`);
  } else if (utilization != null && utilization >= 70) {
    score += 12;
    reasons.push(`Credit utilization is elevated (${utilization}%).`);
  } else if (utilization != null && utilization < 40 && outstanding > 0) {
    score -= 5;
    reasons.push(`Credit utilization is moderate-to-low (${utilization}%).`);
  }

  if (overdueCount > 0) {
    score += Math.min(30, 10 + overdueCount * 6);
    reasons.push(
      `${overdueCount} overdue invoice${overdueCount === 1 ? '' : 's'} totaling ₱${overdueAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`
    );
  } else if (hasLimit || outstanding > 0) {
    reasons.push('No overdue invoices detected from available due dates.');
  }

  if (completedPayments.length >= 3) {
    score -= 8;
    reasons.push(`${completedPayments.length} recent completed payments on record.`);
  } else if (completedPayments.length === 0 && outstanding > 0) {
    score += 10;
    reasons.push('Outstanding balance with no recent completed payments.');
  } else if (completedPayments.length === 0 && !hasLimit) {
    reasons.push('No payment history on file yet.');
  }

  if (String(customer.credit_status) === 'Over Limit') {
    // already counted via outstanding > limit; keep reason if missing
    if (!reasons.some((r) => r.includes('exceeds'))) {
      reasons.push('Customer is currently over the approved credit limit.');
      score += 10;
    }
  }

  score = Math.max(0, Math.min(100, score));
  let level = 'Low';
  if (score >= 65) level = 'High';
  else if (score >= 40) level = 'Medium';

  if (!reasons.length) {
    reasons.push('Insufficient history — defaulting to a cautious baseline.');
  }

  return { level, score, reasons };
}

export function buildLimitSuggestion(evidence, risk) {
  const financial = evidence.financial || {};
  const hasLimit = financial.credit_limit != null && financial.credit_limit > 0;
  const payments = (financial.payment_history || []).filter((p) => {
    const status = String(p.status || p.payment_status || '');
    return status === 'Paid' || status === 'Partial' || status === 'Completed';
  });
  const overdueCount = Number(financial.overdue_count || 0);

  if (risk.level === 'High') {
    return {
      eligible: false,
      message: 'High risk indicators present — Branch Manager should review carefully before increasing credit.',
      suggested_limit: null,
    };
  }

  if (payments.length >= 3 && overdueCount === 0) {
    const base = hasLimit ? financial.credit_limit : Math.max(5000, money(financial.outstanding_balance) * 1.5);
    const suggested = money(base * (hasLimit ? 1.25 : 1));
    return {
      eligible: true,
      message: hasLimit
        ? 'Customer demonstrates consistent payments and may be eligible for a higher credit limit.'
        : 'Customer shows recent payment activity and may be eligible for an initial credit limit.',
      suggested_limit: suggested,
    };
  }

  if (!hasLimit) {
    return {
      eligible: true,
      message: 'Eligible for review — no approved credit limit yet. Branch Manager sets the limit.',
      suggested_limit: null,
    };
  }

  return {
    eligible: false,
    message: 'Maintain current limit unless Branch Manager finds a reason to change it.',
    suggested_limit: null,
  };
}

/** Snapshot frozen at request time. */
export function freezeCreditSnapshot(evidence) {
  return {
    captured_at: new Date().toISOString(),
    customer: evidence.customer,
    financial: {
      ...evidence.financial,
      // keep payment/invoice arrays inside snapshot
    },
    risk: evidence.risk,
    suggestion: evidence.suggestion,
    previous_decisions: evidence.previous_decisions,
  };
}

export async function createCreditReview(client, {
  customerId,
  branchId,
  submittedBy,
  requestReason,
  requestedCreditLimit,
  requestRemarks,
}) {
  const reason = cleanText(requestReason);
  if (!reason || !CREDIT_REVIEW_REASONS.includes(reason)) {
    const err = new Error('A valid request reason is required.');
    err.status = 400;
    throw err;
  }

  const pending = await client.query(
    `SELECT ci_id, status FROM credit_investigations
     WHERE customer_id = $1 AND status IN ('Pending', 'Revision Requested')
     ORDER BY created_at DESC LIMIT 1`,
    [customerId]
  );
  if (pending.rows.length) {
    const err = new Error('A credit review is already pending Branch Manager decision for this customer.');
    err.status = 409;
    err.existingId = pending.rows[0].ci_id;
    throw err;
  }

  const evidence = await buildCustomerCreditEvidence(client, customerId);
  if (!evidence) {
    const err = new Error('Customer not found.');
    err.status = 404;
    throw err;
  }

  const snapshot = freezeCreditSnapshot(evidence);
  const risk = evidence.risk;
  let requested = null;
  if (requestedCreditLimit !== undefined && requestedCreditLimit !== null && requestedCreditLimit !== '') {
    requested = money(requestedCreditLimit);
    if (!(requested > 0)) {
      const err = new Error('Requested credit limit must be a positive amount.');
      err.status = 400;
      throw err;
    }
  }

  const result = await client.query(
    `INSERT INTO credit_investigations (
       customer_id, branch_id, submitted_by, status,
       purpose, request_reason, requested_credit_limit, request_remarks, form_remarks,
       monthly_income, financial_snapshot_json,
       risk_level, risk_score, risk_reasons_json, leaflet_classification,
       delinquency_status, delinquency_flags_json, payment_history_json
     ) VALUES (
       $1, $2, $3, 'Pending',
       $4, $4, $5, $6, $6,
       $7, $8::jsonb,
       $9, $10, $11::jsonb, $9,
       $12, $13::jsonb, $14::jsonb
     )
     RETURNING ci_id, status, created_at, risk_level, requested_credit_limit`,
    [
      customerId,
      branchId,
      submittedBy,
      reason,
      requested,
      cleanText(requestRemarks),
      evidence.financial.monthly_income || 0,
      JSON.stringify(snapshot),
      risk.level,
      risk.score,
      JSON.stringify(risk.reasons),
      risk.level === 'High' ? 'Review' : 'Clear',
      JSON.stringify(risk.reasons),
      JSON.stringify(evidence.financial.payment_history || []),
    ]
  );

  return {
    row: result.rows[0],
    evidence,
    snapshot,
  };
}

/**
 * In-place resubmit after BM requested revision.
 * Updates the same CI row back to Pending with a fresh snapshot (previous snapshot preserved in revision history).
 */
export async function resubmitCreditReview(client, {
  ciId,
  submittedBy,
  requestReason,
  requestedCreditLimit,
  requestRemarks,
}) {
  const existing = await client.query(
    `SELECT ci.*, c.branch_id AS customer_branch_id
     FROM credit_investigations ci
     JOIN customers c ON c.customer_id = ci.customer_id
     WHERE ci.ci_id = $1
     FOR UPDATE`,
    [Number(ciId)]
  );
  if (!existing.rows.length) {
    const err = new Error('Credit review not found.');
    err.status = 404;
    throw err;
  }

  const review = existing.rows[0];
  if (Number(review.submitted_by) !== Number(submittedBy)) {
    const err = new Error('Only the original submitter can resubmit this credit review.');
    err.status = 403;
    throw err;
  }
  if (review.status !== 'Revision Requested') {
    const err = new Error(
      review.status === 'Pending'
        ? 'This credit review is already pending Branch Manager decision.'
        : `This credit review cannot be resubmitted while status is ${review.status}.`
    );
    err.status = 409;
    err.existingId = review.ci_id;
    throw err;
  }

  const reason = cleanText(requestReason) || cleanText(review.request_reason) || cleanText(review.purpose);
  if (!reason || !CREDIT_REVIEW_REASONS.includes(reason)) {
    const err = new Error('A valid request reason is required.');
    err.status = 400;
    throw err;
  }

  const evidence = await buildCustomerCreditEvidence(client, review.customer_id);
  if (!evidence) {
    const err = new Error('Customer not found.');
    err.status = 404;
    throw err;
  }

  const snapshot = freezeCreditSnapshot(evidence);
  const risk = evidence.risk;
  let requested = null;
  if (requestedCreditLimit !== undefined && requestedCreditLimit !== null && requestedCreditLimit !== '') {
    requested = money(requestedCreditLimit);
    if (!(requested > 0)) {
      const err = new Error('Requested credit limit must be a positive amount.');
      err.status = 400;
      throw err;
    }
  } else if (review.requested_credit_limit != null) {
    requested = money(review.requested_credit_limit);
  }

  const previousHistory = parseJson(review.revision_history_json, []);
  const history = Array.isArray(previousHistory) ? [...previousHistory] : [];
  history.push({
    event: 'sales_resubmit',
    at: new Date().toISOString(),
    by: submittedBy,
    previous_status: review.status,
    previous_snapshot: parseJson(review.financial_snapshot_json, {}),
    previous_decision_remarks: review.decision_remarks || null,
    previous_rejection_reason: review.rejection_reason || null,
  });

  const result = await client.query(
    `UPDATE credit_investigations SET
       status = 'Pending',
       purpose = $1,
       request_reason = $1,
       requested_credit_limit = $2,
       request_remarks = $3,
       form_remarks = $3,
       monthly_income = $4,
       financial_snapshot_json = $5::jsonb,
       risk_level = $6,
       risk_score = $7,
       risk_reasons_json = $8::jsonb,
       leaflet_classification = $6,
       delinquency_status = $9,
       delinquency_flags_json = $10::jsonb,
       payment_history_json = $11::jsonb,
       revision_history_json = $12::jsonb,
       approved_by = NULL,
       approved_credit_limit = NULL,
       decided_at = NULL,
       updated_at = CURRENT_TIMESTAMP,
       resubmitted_at = CURRENT_TIMESTAMP,
       resubmitted_by = $13
     WHERE ci_id = $14
     RETURNING ci_id, status, created_at, updated_at, risk_level, requested_credit_limit, customer_id`,
    [
      reason,
      requested,
      cleanText(requestRemarks),
      evidence.financial.monthly_income || 0,
      JSON.stringify(snapshot),
      risk.level,
      risk.score,
      JSON.stringify(risk.reasons),
      risk.level === 'High' ? 'Review' : 'Clear',
      JSON.stringify(risk.reasons),
      JSON.stringify(evidence.financial.payment_history || []),
      JSON.stringify(history),
      submittedBy,
      review.ci_id,
    ]
  );

  return {
    row: result.rows[0],
    evidence,
    snapshot,
    resubmitted: true,
  };
}

/**
 * Apply BM decision. Approval UPSERTS customer_credit_info.credit_limit.
 * @param {object} opts
 * @param {number|null} opts.branchId - null/undefined means unscoped (OM/super admin)
 */
export async function applyCreditReviewDecision(client, {
  ciId,
  branchId = null,
  reviewerId,
  status,
  approvedCreditLimit,
  rejectionReason,
  decisionRemarks,
}) {
  const allowed = new Set(['Approved', 'Rejected', 'Revision Requested']);
  if (!allowed.has(status)) {
    const err = new Error('Invalid status.');
    err.status = 400;
    throw err;
  }

  const params = [ciId];
  let scopeSql = 'TRUE';
  if (branchId != null && Number.isFinite(Number(branchId))) {
    params.push(Number(branchId));
    scopeSql = `ci.branch_id = $2`;
  }

  const existing = await client.query(
    `SELECT ci.*, c.first_name || ' ' || c.last_name AS customer_name
     FROM credit_investigations ci
     JOIN customers c ON c.customer_id = ci.customer_id
     WHERE ci.ci_id = $1 AND ${scopeSql}`,
    params
  );

  if (!existing.rows.length) {
    const err = new Error('Credit review not found.');
    err.status = 404;
    throw err;
  }

  const review = existing.rows[0];
  if (review.status !== 'Pending' && review.status !== 'Revision Requested') {
    const err = new Error(`This credit review is already ${review.status}.`);
    err.status = 409;
    throw err;
  }

  const remarks = cleanText(decisionRemarks);
  const rejectText = cleanText(rejectionReason);

  if (status === 'Rejected' && !rejectText && !remarks) {
    const err = new Error('Rejection reason is required.');
    err.status = 400;
    throw err;
  }
  if (status === 'Revision Requested' && !remarks && !rejectText) {
    const err = new Error('Revision instructions are required.');
    err.status = 400;
    throw err;
  }

  let approvedLimit = null;
  if (status === 'Approved') {
    const snapshot = parseJson(review.financial_snapshot_json, {});
    const suggested = snapshot?.suggestion?.suggested_limit;
    const requested = review.requested_credit_limit != null ? money(review.requested_credit_limit) : null;
    const current = snapshot?.financial?.credit_limit != null ? money(snapshot.financial.credit_limit) : null;

    if (approvedCreditLimit !== undefined && approvedCreditLimit !== null && approvedCreditLimit !== '') {
      approvedLimit = money(approvedCreditLimit);
    } else if (requested != null && requested > 0) {
      approvedLimit = requested;
    } else if (suggested != null && suggested > 0) {
      approvedLimit = money(suggested);
    } else if (current != null && current > 0) {
      approvedLimit = current;
    }

    if (!(approvedLimit > 0)) {
      const err = new Error('Approved credit limit is required when approving a credit review.');
      err.status = 400;
      throw err;
    }
  }

  const previousHistory = parseJson(review.revision_history_json, []);
  const history = Array.isArray(previousHistory) ? [...previousHistory] : [];
  history.push({
    event: 'bm_decision',
    at: new Date().toISOString(),
    by: reviewerId,
    previous_status: review.status,
    new_status: status,
    remarks: remarks || rejectText || null,
    approved_credit_limit: status === 'Approved' ? approvedLimit : null,
  });

  const updated = await client.query(
    `UPDATE credit_investigations
     SET status = $1,
         approved_by = $2,
         rejection_reason = CASE WHEN $1 = 'Rejected' THEN COALESCE($3, rejection_reason) ELSE rejection_reason END,
         decision_remarks = COALESCE($4, decision_remarks),
         approved_credit_limit = CASE WHEN $1 = 'Approved' THEN $5 ELSE approved_credit_limit END,
         decided_at = CURRENT_TIMESTAMP,
         revision_history_json = $7::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE ci_id = $6
     RETURNING *`,
    [status, reviewerId, rejectText, remarks, approvedLimit, ciId, JSON.stringify(history)]
  );

  if (status === 'Approved') {
    await client.query(
      `INSERT INTO customer_credit_info (
         customer_id, credit_limit, monthly_income, approved_by, approved_date, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (customer_id) DO UPDATE SET
         credit_limit = EXCLUDED.credit_limit,
         monthly_income = COALESCE(customer_credit_info.monthly_income, EXCLUDED.monthly_income),
         approved_by = EXCLUDED.approved_by,
         approved_date = EXCLUDED.approved_date,
         updated_at = CURRENT_TIMESTAMP`,
      [
        review.customer_id,
        approvedLimit,
        review.monthly_income || 0,
        reviewerId,
      ]
    );
  }

  return {
    row: updated.rows[0],
    customerName: review.customer_name,
    submittedBy: review.submitted_by,
    approvedLimit,
    branchId: review.branch_id ?? updated.rows[0]?.branch_id ?? null,
  };
}

export function mapCreditReviewApiRow(row, { liveEvidence = null } = {}) {
  const snapshot = parseJson(row.financial_snapshot_json, {});
  const riskReasons = parseJson(row.risk_reasons_json, []);
  const flags = parseJson(row.delinquency_flags_json, []);
  const payments = parseJson(row.payment_history_json, []);

  const displayStatus = (row.status === 'Pending' || row.status === 'Revision Requested')
    ? 'Needs BM'
    : row.status;
  const revisionHistory = parseJson(row.revision_history_json, []);

  return {
    ci_id: row.ci_id,
    customer_id: row.customer_id,
    branch_id: row.branch_id,
    status: row.status,
    display_status: displayStatus,
    request_reason: row.request_reason || row.purpose || null,
    purpose: row.purpose,
    requested_credit_limit: row.requested_credit_limit != null ? money(row.requested_credit_limit) : null,
    request_remarks: row.request_remarks || row.form_remarks || null,
    form_remarks: row.form_remarks,
    risk_level: row.risk_level || row.leaflet_classification || null,
    risk_score: row.risk_score ?? null,
    risk_reasons: Array.isArray(riskReasons) ? riskReasons : (Array.isArray(flags) ? flags : []),
    approved_credit_limit: row.approved_credit_limit != null ? money(row.approved_credit_limit) : null,
    decision_remarks: row.decision_remarks || null,
    rejection_reason: row.rejection_reason || null,
    decided_at: row.decided_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resubmitted_at: row.resubmitted_at || null,
    customer_name: row.customer_name,
    customer_code: row.customer_code,
    contact_phone: row.contact_phone || null,
    branch_name: row.branch_name,
    submitted_by_name: row.submitted_by_name,
    approved_by_name: row.approved_by_name,
    assigned_sales_agent_id: row.assigned_sales_agent_id || null,
    assigned_sales_agent_name: row.assigned_sales_agent_name || null,
    account_manager_name: row.account_manager_name || null,
    outstanding_balance: row.outstanding_balance != null ? money(row.outstanding_balance) : null,
    live_credit_limit: row.live_credit_limit != null ? money(row.live_credit_limit) : null,
    revision_history: Array.isArray(revisionHistory) ? revisionHistory : [],
    snapshot,
    live: liveEvidence || null,
    // legacy compatibility fields used by older UI mappers
    monthly_income: row.monthly_income,
    business_type: row.business_type,
    references_summary: row.references_summary,
    delinquency_status: row.delinquency_status,
    leaflet_classification: row.leaflet_classification || row.risk_level,
    delinquency_flags_json: Array.isArray(riskReasons) && riskReasons.length ? riskReasons : flags,
    payment_history_json: Array.isArray(payments) ? payments : (snapshot?.financial?.payment_history || []),
  };
}
