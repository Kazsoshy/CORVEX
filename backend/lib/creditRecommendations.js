/**
 * Proactive credit investigation candidate discovery.
 * Reuses buildCustomerCreditEvidence / assessCreditRisk — does not auto-approve limits.
 */
import {
  buildCustomerCreditEvidence,
  createCreditReview,
} from './creditReview.js';
import { OVERDUE_CUSTOMER_SQL } from './customerStanding.js';

export const RECOMMENDATION_TYPES = [
  'First Limit',
  'Limit Increase',
  'Delinquency',
  'Initial CI',
  'KYC',
  'Exposure',
  'Collector Flag',
];

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function utilization(outstanding, limit) {
  const bal = money(outstanding);
  const lim = money(limit);
  if (!(lim > 0)) return null;
  return Math.round((bal / lim) * 1000) / 10;
}

/**
 * Derive recommendation candidates from live evidence for one customer.
 * @returns {Array<{ type, trigger, suggestedAction, riskLevel, riskScore, evidence }>}
 */
export function deriveRecommendationCandidates(evidence) {
  if (!evidence?.customer) return [];
  if (String(evidence.customer.status || '') !== 'Active') return [];

  const financial = evidence.financial || {};
  const risk = evidence.risk || {};
  const outstanding = money(financial.outstanding_balance);
  const limit = money(financial.credit_limit);
  const util = utilization(outstanding, limit);
  const overdueCount = Number(financial.overdue_count || 0);
  const openInvoices = Array.isArray(financial.open_invoices) ? financial.open_invoices : [];
  const openInvoiceCount = openInvoices.length || Number(financial.open_invoice_count || 0);
  const kyc = String(evidence.customer.id_verification_status || 'Unverified');
  const hasOpenCi = Boolean(evidence.pending_review);
  const out = [];

  if (hasOpenCi) return out;

  if (!(limit > 0) && (outstanding > 0 || openInvoiceCount > 0)) {
    out.push({
      type: 'First Limit',
      trigger: 'Active customer with credit activity and no approved credit limit.',
      suggestedAction: 'Submit a First Credit Limit Review.',
      riskLevel: risk.level || null,
      riskScore: risk.score ?? null,
      evidence: { outstanding, credit_limit: limit, utilization: util, overdue_count: overdueCount },
    });
  }

  if (limit > 0 && util != null && util >= 90) {
    out.push({
      type: 'Limit Increase',
      trigger: `Credit utilization is ${util}% (≥ 90%).`,
      suggestedAction: 'Review whether a higher limit is warranted.',
      riskLevel: risk.level || null,
      riskScore: risk.score ?? null,
      evidence: { outstanding, credit_limit: limit, utilization: util },
    });
  }

  if (overdueCount > 0) {
    out.push({
      type: 'Delinquency',
      trigger: `Customer has ${overdueCount} unpaid past-due invoice(s).`,
      suggestedAction: 'Review delinquency before extending additional credit.',
      riskLevel: risk.level || 'High',
      riskScore: risk.score ?? null,
      evidence: {
        outstanding,
        overdue_count: overdueCount,
        overdue_amount: money(financial.overdue_amount || 0),
      },
    });
  }

  const installmentIntent = openInvoices.some((inv) => {
    const payType = String(inv.pay_type || '').toLowerCase();
    return payType.includes('install') || Number(inv.term_months) > 0;
  });
  if (!(limit > 0) && installmentIntent) {
    out.push({
      type: 'Initial CI',
      trigger: 'New or unlimited customer has recorded installment / term sale activity.',
      suggestedAction: 'Submit an Initial Credit Investigation before further installment sales.',
      riskLevel: risk.level || null,
      riskScore: risk.score ?? null,
      evidence: { outstanding, credit_limit: limit, installment_intent: true },
    });
  }

  if (
    (kyc === 'Unverified' || kyc === 'Pending Review')
    && (outstanding > 0 || limit > 0)
  ) {
    out.push({
      type: 'KYC',
      trigger: `KYC status is ${kyc} while credit activity exists.`,
      suggestedAction: 'Complete KYC / compliance review before expanding credit.',
      riskLevel: risk.level || 'Medium',
      riskScore: risk.score ?? null,
      evidence: { kyc_status: kyc, outstanding, credit_limit: limit },
    });
  }

  if (limit > 0 && outstanding > limit * 1.1) {
    out.push({
      type: 'Exposure',
      trigger: 'Outstanding balance exceeds the approved credit limit.',
      suggestedAction: 'Investigate exposure and collection standing.',
      riskLevel: risk.level || 'High',
      riskScore: risk.score ?? null,
      evidence: { outstanding, credit_limit: limit, utilization: util },
    });
  }

  return out;
}

/**
 * Evaluate Active branch customers and upsert open recommendations.
 * Skips customers with an open formal CI. Does not recreate dismissed types unless force.
 */
export async function evaluateBranchCreditRecommendations(pool, { branchId, limit = 200 } = {}) {
  if (branchId == null) {
    const err = new Error('branch_id is required to evaluate recommendations.');
    err.status = 400;
    throw err;
  }

  const candidates = await pool.query(
    `SELECT c.customer_id
     FROM customers c
     LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
     LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
     WHERE c.branch_id = $1
       AND c.status = 'Active'
       AND (
         COALESCE(ca.outstanding_balance, 0) > 0
         OR COALESCE(cci.credit_limit, 0) > 0
         OR ${OVERDUE_CUSTOMER_SQL}
         OR COALESCE(c.id_verification_status, 'Unverified') IN ('Unverified', 'Pending Review')
       )
       AND NOT EXISTS (
         SELECT 1 FROM credit_investigations ci
         WHERE ci.customer_id = c.customer_id
           AND ci.status IN ('Pending', 'Revision Requested')
       )
     ORDER BY COALESCE(ca.outstanding_balance, 0) DESC, c.customer_id
     LIMIT $2`,
    [Number(branchId), Math.min(500, Math.max(1, Number(limit) || 200))]
  );

  let created = 0;
  let refreshed = 0;
  const client = await pool.connect();
  try {
    for (const row of candidates.rows) {
      const evidence = await buildCustomerCreditEvidence(client, row.customer_id);
      const derived = deriveRecommendationCandidates(evidence);
      for (const item of derived) {
        const existing = await client.query(
          `SELECT recommendation_id, status
           FROM credit_recommendations
           WHERE customer_id = $1
             AND recommendation_type = $2
             AND status IN ('New', 'Watching', 'Dismissed')
           ORDER BY
             CASE status WHEN 'New' THEN 0 WHEN 'Watching' THEN 1 ELSE 2 END,
             updated_at DESC
           LIMIT 1`,
          [row.customer_id, item.type]
        );

        if (existing.rows.length) {
          const cur = existing.rows[0];
          if (cur.status === 'Dismissed') {
            // Keep dismissed unless a meaningfully different trigger appears later cycles.
            continue;
          }
          await client.query(
            `UPDATE credit_recommendations SET
               trigger_reason = $1,
               evidence_json = $2::jsonb,
               risk_level = $3,
               risk_score = $4,
               suggested_action = $5,
               last_evaluated_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
             WHERE recommendation_id = $6`,
            [
              item.trigger,
              JSON.stringify(item.evidence || {}),
              item.riskLevel,
              item.riskScore,
              item.suggestedAction,
              cur.recommendation_id,
            ]
          );
          refreshed += 1;
          continue;
        }

        await client.query(
          `INSERT INTO credit_recommendations (
             customer_id, branch_id, recommendation_type, trigger_reason,
             evidence_json, risk_level, risk_score, suggested_action, status
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'New')`,
          [
            row.customer_id,
            Number(branchId),
            item.type,
            item.trigger,
            JSON.stringify(item.evidence || {}),
            item.riskLevel,
            item.riskScore,
            item.suggestedAction,
          ]
        );
        created += 1;
      }
    }
  } finally {
    client.release();
  }

  return { scanned: candidates.rows.length, created, refreshed };
}

export async function listCreditRecommendations(pool, {
  branchId = null,
  status = null,
  recommendationType = null,
  riskLevel = null,
  salesAgentId = null,
  search = null,
  page = 1,
  limit = 25,
} = {}) {
  const conditions = [];
  const params = [];
  let p = 1;

  if (branchId != null) {
    conditions.push(`cr.branch_id = $${p++}`);
    params.push(Number(branchId));
  }
  if (status && status !== 'All') {
    conditions.push(`cr.status = $${p++}`);
    params.push(status);
  } else {
    conditions.push(`cr.status IN ('New', 'Watching')`);
  }
  if (recommendationType && recommendationType !== 'All') {
    conditions.push(`cr.recommendation_type = $${p++}`);
    params.push(recommendationType);
  }
  if (riskLevel && riskLevel !== 'All') {
    conditions.push(`cr.risk_level = $${p++}`);
    params.push(riskLevel);
  }
  if (salesAgentId) {
    conditions.push(`c.assigned_sales_agent_id = $${p++}`);
    params.push(Number(salesAgentId));
  }
  if (search) {
    conditions.push(`(
      c.first_name ILIKE $${p}
      OR c.last_name ILIKE $${p}
      OR c.customer_code ILIKE $${p}
      OR CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,'')) ILIKE $${p}
      OR cr.trigger_reason ILIKE $${p}
    )`);
    params.push(`%${search}%`);
    p += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (Math.max(1, Number(page) || 1) - 1) * Math.min(100, Math.max(1, Number(limit) || 25));
  const lim = Math.min(100, Math.max(1, Number(limit) || 25));

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM credit_recommendations cr
     JOIN customers c ON c.customer_id = cr.customer_id
     ${where}`,
    params
  );

  const result = await pool.query(
    `SELECT
       cr.*,
       c.customer_code,
       TRIM(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name)) AS customer_name,
       c.contact_phone,
       c.assigned_sales_agent_id,
       COALESCE(NULLIF(TRIM(sa.full_name), ''), TRIM(CONCAT_WS(' ', sa.first_name, sa.last_name))) AS sales_agent_name,
       b.name AS branch_name,
       COALESCE(ca.outstanding_balance, 0)::float AS outstanding_balance,
       COALESCE(cci.credit_limit, 0)::float AS credit_limit
     FROM credit_recommendations cr
     JOIN customers c ON c.customer_id = cr.customer_id
     JOIN branches b ON b.id = cr.branch_id
     LEFT JOIN users sa ON sa.id = c.assigned_sales_agent_id
     LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
     LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
     ${where}
     ORDER BY
       CASE cr.status WHEN 'New' THEN 0 WHEN 'Watching' THEN 1 ELSE 2 END,
       CASE cr.risk_level WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,
       cr.last_evaluated_at DESC
     LIMIT $${p++} OFFSET $${p++}`,
    [...params, lim, offset]
  );

  return {
    rows: result.rows.map((row) => ({
      ...row,
      utilization: utilization(row.outstanding_balance, row.credit_limit),
      evidence: typeof row.evidence_json === 'string'
        ? JSON.parse(row.evidence_json)
        : (row.evidence_json || {}),
    })),
    total: Number(countRes.rows[0]?.n) || 0,
  };
}

export async function updateRecommendationStatus(client, {
  recommendationId,
  branchId = null,
  status,
  dismissedReason = null,
  actorId = null,
  convertedCiId = null,
}) {
  const allowed = new Set(['Watching', 'Dismissed', 'Converted to CI', 'New']);
  if (!allowed.has(status)) {
    const err = new Error('Invalid recommendation status.');
    err.status = 400;
    throw err;
  }
  if (status === 'Dismissed' && !String(dismissedReason || '').trim()) {
    const err = new Error('A dismissal reason is required.');
    err.status = 400;
    throw err;
  }

  const params = [recommendationId];
  let scope = 'TRUE';
  if (branchId != null) {
    params.push(Number(branchId));
    scope = `branch_id = $2`;
  }

  const existing = await client.query(
    `SELECT * FROM credit_recommendations WHERE recommendation_id = $1 AND ${scope}`,
    params
  );
  if (!existing.rows.length) {
    const err = new Error('Recommendation not found.');
    err.status = 404;
    throw err;
  }

  const result = await client.query(
    `UPDATE credit_recommendations SET
       status = $1,
       dismissed_reason = CASE WHEN $1 = 'Dismissed' THEN $2 ELSE dismissed_reason END,
       dismissed_by = CASE WHEN $1 = 'Dismissed' THEN $3 ELSE dismissed_by END,
       dismissed_at = CASE WHEN $1 = 'Dismissed' THEN CURRENT_TIMESTAMP ELSE dismissed_at END,
       converted_ci_id = CASE WHEN $1 = 'Converted to CI' THEN $4 ELSE converted_ci_id END,
       updated_at = CURRENT_TIMESTAMP
     WHERE recommendation_id = $5
     RETURNING *`,
    [
      status,
      dismissedReason ? String(dismissedReason).trim() : null,
      actorId,
      convertedCiId,
      recommendationId,
    ]
  );
  return result.rows[0];
}

export async function convertRecommendationToCi(client, {
  recommendationId,
  branchId = null,
  submittedBy,
  requestReason = null,
  requestedCreditLimit = null,
  requestRemarks = null,
}) {
  const params = [recommendationId];
  let scope = 'TRUE';
  if (branchId != null) {
    params.push(Number(branchId));
    scope = `cr.branch_id = $2`;
  }

  const existing = await client.query(
    `SELECT cr.*, c.branch_id AS customer_branch_id
     FROM credit_recommendations cr
     JOIN customers c ON c.customer_id = cr.customer_id
     WHERE cr.recommendation_id = $1 AND ${scope}`,
    params
  );
  if (!existing.rows.length) {
    const err = new Error('Recommendation not found.');
    err.status = 404;
    throw err;
  }
  const rec = existing.rows[0];
  if (rec.status === 'Converted to CI' && rec.converted_ci_id) {
    const err = new Error('This recommendation was already converted to a credit investigation.');
    err.status = 409;
    err.existingId = rec.converted_ci_id;
    throw err;
  }
  if (rec.status === 'Dismissed') {
    const err = new Error('Dismissed recommendations cannot be converted.');
    err.status = 409;
    throw err;
  }

  const reasonMap = {
    'First Limit': 'First installment',
    'Limit Increase': 'Need higher limit',
    Delinquency: 'Customer over limit but wants another sale',
    'Initial CI': 'First installment',
    KYC: 'Other',
    Exposure: 'Customer over limit but wants another sale',
    'Collector Flag': 'Other',
  };
  const reason = requestReason || reasonMap[rec.recommendation_type] || 'Other';
  const remarks = requestRemarks
    || `Converted from recommendation #${rec.recommendation_id}: ${rec.trigger_reason}`;

  const created = await createCreditReview(client, {
    customerId: rec.customer_id,
    branchId: rec.branch_id,
    submittedBy,
    requestReason: reason,
    requestedCreditLimit,
    requestRemarks: remarks,
  });

  await updateRecommendationStatus(client, {
    recommendationId: rec.recommendation_id,
    branchId,
    status: 'Converted to CI',
    actorId: submittedBy,
    convertedCiId: created.row.ci_id,
  });

  return { recommendation: rec, created };
}

/**
 * Collector (or authorized field user) flags a customer for credit review.
 * Creates/updates a recommendation — does NOT create a formal CI application.
 */
export async function flagCustomerForCreditReview(client, {
  customerId,
  branchId,
  flaggedBy,
  reason,
  observation = null,
  note = null,
  photoUrl = null,
}) {
  const trigger = String(reason || '').trim();
  if (!trigger) {
    const err = new Error('A flag reason is required.');
    err.status = 400;
    throw err;
  }

  const evidence = await buildCustomerCreditEvidence(client, customerId);
  if (!evidence) {
    const err = new Error('Customer not found.');
    err.status = 404;
    throw err;
  }

  const support = {
    source: 'collector_flag',
    flagged_by: flaggedBy,
    observation: observation ? String(observation).trim() : null,
    note: note ? String(note).trim() : null,
    photo_url: photoUrl || null,
    outstanding: evidence.financial?.outstanding_balance ?? null,
    credit_limit: evidence.financial?.credit_limit ?? null,
    utilization: utilization(
      evidence.financial?.outstanding_balance,
      evidence.financial?.credit_limit
    ),
  };

  const existing = await client.query(
    `SELECT recommendation_id, status
     FROM credit_recommendations
     WHERE customer_id = $1
       AND recommendation_type = 'Collector Flag'
       AND status IN ('New', 'Watching')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [customerId]
  );

  if (existing.rows.length) {
    const result = await client.query(
      `UPDATE credit_recommendations SET
         trigger_reason = $1,
         evidence_json = $2::jsonb,
         risk_level = $3,
         risk_score = $4,
         suggested_action = $5,
         status = 'New',
         last_evaluated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE recommendation_id = $6
       RETURNING *`,
      [
        trigger,
        JSON.stringify(support),
        evidence.risk?.level || null,
        evidence.risk?.score ?? null,
        'Review field observation and decide whether formal CI is needed.',
        existing.rows[0].recommendation_id,
      ]
    );
    return { row: result.rows[0], created: false };
  }

  const inserted = await client.query(
    `INSERT INTO credit_recommendations (
       customer_id, branch_id, recommendation_type, trigger_reason,
       evidence_json, risk_level, risk_score, suggested_action, status
     ) VALUES ($1,$2,'Collector Flag',$3,$4::jsonb,$5,$6,$7,'New')
     RETURNING *`,
    [
      customerId,
      branchId,
      trigger,
      JSON.stringify(support),
      evidence.risk?.level || null,
      evidence.risk?.score ?? null,
      'Review field observation and decide whether formal CI is needed.',
    ]
  );
  return { row: inserted.rows[0], created: true };
}
