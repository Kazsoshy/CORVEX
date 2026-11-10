import express from 'express';
import { requireAuth, isUnscoped, ROLE_SETS, requireRole } from '../middleware/auth.js';
import {
  CREDIT_INVESTIGATION_FROM,
  CREDIT_INVESTIGATION_SELECT,
} from '../lib/creditInvestigationQueries.js';
import { notifyCreditInvestigationDecision } from '../lib/creditInvestigationNotifications.js';
import {
  applyCreditReviewDecision,
  buildCustomerCreditEvidence,
  mapCreditReviewApiRow,
} from '../lib/creditReview.js';
import {
  convertRecommendationToCi,
  evaluateBranchCreditRecommendations,
  listCreditRecommendations,
  updateRecommendationStatus,
} from '../lib/creditRecommendations.js';
import { notifyCreditInvestigationSubmitted } from '../lib/creditInvestigationNotifications.js';
import { upsertBranchInventoryStock, insertStockMovement } from '../lib/branchInventoryStock.js';
import { reverseCustomerSaleCharge } from '../lib/salesInvoiceWrite.js';
import { publishStockAlerts, notifyInvoiceReviewDecision, clearOverdueDedup, notifyOverdueAccounts } from '../lib/operationalNotifications.js';
import { manilaDateString } from '../lib/sawCollection.js';
import {
  confirmCollectionPayment,
  rejectCollectionPayment,
  reverseCollectionPayment,
} from '../lib/collectionPayment.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';
import {
  loadRestockLines,
  manilaToday,
  postRestockStock,
  postStockCountAdjustments,
  summarizeLines,
} from '../lib/inventoryDocuments.js';
import {
  notifyRestockDecision,
  notifyRestockRecorded,
  notifyStockCountDecision,
} from '../lib/inventoryTransferNotifications.js';
import { logWarehouseAudit } from '../lib/branchInventoryStock.js';

const router = express.Router();
const APPROVAL_ROLES = [...new Set([...ROLE_SETS.branchOps, 'operating_manager', 'super_admin'])];

router.use(requireAuth, requireRole(APPROVAL_ROLES));

function branchFilter(user, alias = '', paramOffset = 1) {
  const col = alias ? `${alias}.branch_id` : 'branch_id';
  if (isUnscoped(user)) return { sql: 'TRUE', params: [] };
  return { sql: `${col} = $${paramOffset}`, params: [user.branchId] };
}

router.get('/credit-investigations', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const status = String(req.query.status || '').replace(/\+/g, ' ').trim();
    const search = String(req.query.search || '').trim();
    const riskLevel = String(req.query.risk_level || '').trim();
    const salesAgentId = req.query.sales_agent_id ? Number(req.query.sales_agent_id) : null;
    const sort = String(req.query.sort || 'newest').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const includeStats = String(req.query.include_stats || '') === '1'
      || String(req.query.include_stats || '').toLowerCase() === 'true';

    const scope = branchFilter(user, 'ci');
    const params = [...scope.params];
    let idx = params.length + 1;
    let statusSql = '';
    if (status && status !== 'All') {
      if (status === 'Needs BM' || status === 'Pending' || status === 'needs_bm' || status === 'Needs Decision') {
        statusSql = ` AND ci.status IN ('Pending', 'Revision Requested')`;
      } else if (status === 'Revision Requested') {
        statusSql = ` AND ci.status = 'Revision Requested'`;
      } else {
        statusSql = ` AND ci.status = $${idx++}`;
        params.push(status);
      }
    }
    if (search) {
      statusSql += ` AND (
        c.first_name ILIKE $${idx}
        OR c.last_name ILIKE $${idx}
        OR c.customer_code ILIKE $${idx}
        OR CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,'')) ILIKE $${idx}
        OR CAST(ci.ci_id AS TEXT) ILIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx += 1;
    }
    if (riskLevel && riskLevel !== 'All') {
      statusSql += ` AND ci.risk_level = $${idx++}`;
      params.push(riskLevel);
    }
    if (Number.isFinite(salesAgentId) && salesAgentId > 0) {
      statusSql += ` AND c.assigned_sales_agent_id = $${idx++}`;
      params.push(salesAgentId);
    }

    let orderSql = 'ci.created_at DESC';
    if (sort === 'oldest') orderSql = 'ci.created_at ASC';
    else if (sort === 'risk') {
      orderSql = `CASE ci.risk_level WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, ci.created_at ASC`;
    } else if (sort === 'updated') orderSql = 'ci.updated_at DESC NULLS LAST, ci.created_at DESC';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ${scope.sql}${statusSql}`,
      params
    );
    const total = Number(countResult.rows[0]?.total) || 0;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT ${CREDIT_INVESTIGATION_SELECT}
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ${scope.sql}${statusSql}
       ORDER BY ${orderSql}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    let stats = null;
    if (includeStats) {
      const statsScope = branchFilter(user, 'ci');
      const monthStart = `${manilaDateString().slice(0, 8)}01`;
      const monthParam = statsScope.params.length + 1;
      const statsResult = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE ci.status = 'Pending')::int AS pending,
           COUNT(*) FILTER (WHERE ci.status = 'Revision Requested')::int AS revision_requested,
           COUNT(*) FILTER (
             WHERE ci.status IN ('Pending', 'Revision Requested')
               AND ci.risk_level = 'High'
           )::int AS high_risk_open,
           COUNT(*) FILTER (
             WHERE ci.status = 'Approved'
               AND COALESCE(ci.decided_at, ci.updated_at)::date >= $${monthParam}::date
           )::int AS approved_this_month,
           COALESCE(
             AVG(
               EXTRACT(EPOCH FROM (ci.decided_at - ci.created_at)) / 3600.0
             ) FILTER (WHERE ci.decided_at IS NOT NULL AND ci.status IN ('Approved', 'Rejected')),
             0
           )::float AS avg_decision_hours
         FROM credit_investigations ci
         WHERE ${statsScope.sql}`,
        [...statsScope.params, monthStart]
      );
      const row = statsResult.rows[0] || {};
      stats = {
        pending: Number(row.pending) || 0,
        revisionRequested: Number(row.revision_requested) || 0,
        highRiskOpen: Number(row.high_risk_open) || 0,
        approvedThisMonth: Number(row.approved_this_month) || 0,
        averageDecisionHours: Math.round((Number(row.avg_decision_hours) || 0) * 10) / 10,
      };
    }

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => mapCreditReviewApiRow(row)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
      meta: stats ? { stats } : undefined,
    });
  } catch (err) {
    console.error('[Approvals] GET /credit-investigations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load credit reviews.' });
  }
});

router.get('/credit-investigations/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const ciId = Number(req.params.id);
    const scope = branchFilter(user, 'ci', 2);
    const params = [ciId, ...scope.params];

    const result = await pool.query(
      `SELECT ${CREDIT_INVESTIGATION_SELECT}
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ci.ci_id = $1 AND ${scope.sql}`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Credit review not found.' });
    }

    const row = result.rows[0];
    const liveEvidence = await buildCustomerCreditEvidence(pool, row.customer_id);

    return res.status(200).json({
      success: true,
      data: mapCreditReviewApiRow(row, { liveEvidence }),
    });
  } catch (err) {
    console.error('[Approvals] GET /credit-investigations/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load credit review.' });
  }
});

router.patch('/credit-investigations/:id', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const user = req.currentUser;
    const ciId = Number(req.params.id);
    const {
      status,
      rejection_reason: rejectionReason,
      decision_remarks: decisionRemarks,
      approved_credit_limit: approvedCreditLimit,
    } = req.body;

    await client.query('BEGIN');
    const decided = await applyCreditReviewDecision(client, {
      ciId,
      branchId: isUnscoped(user) ? null : user.branchId,
      reviewerId: user.id,
      status,
      approvedCreditLimit,
      rejectionReason,
      decisionRemarks: decisionRemarks || rejectionReason,
    });
    await client.query('COMMIT');

    await notifyCreditInvestigationDecision(req.app.locals.pool, {
      submitterId: decided.submittedBy,
      ciId,
      customerName: decided.customerName,
      status,
      rejectionReason: rejectionReason || null,
    });

    const message = status === 'Approved'
      ? `Credit review approved. Limit set to ₱${Number(decided.approvedLimit || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`
      : `Credit review ${String(status).toLowerCase()}.`;

    const auditStatus = status === 'Approved'
      ? AUDIT_STATUS.APPROVED
      : status === 'Rejected'
        ? AUDIT_STATUS.REJECTED
        : AUDIT_STATUS.UPDATED;
    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Credit Approvals',
      activity: `Credit ${status}`,
      action: `Credit ${status}`,
      description: `${status} credit investigation #${ciId}${decided.customerName ? ` for ${decided.customerName}` : ''}${status === 'Rejected' && rejectionReason ? `. Reason: ${rejectionReason}` : ''}${status === 'Approved' && decided.approvedLimit != null ? `. Limit set to ₱${Number(decided.approvedLimit).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''}.`,
      status: auditStatus,
      affectedRecord: `credit_investigation:${ciId}`,
      branchId: decided.branchId ?? null,
    });

    return res.status(200).json({
      success: true,
      message,
      data: mapCreditReviewApiRow(decided.row),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('[Approvals] PATCH /credit-investigations/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update credit review.' });
  } finally {
    client.release();
  }
});

router.get('/special-collections', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const scope = branchFilter(user, 'scr', 1);

    const result = await pool.query(
      `SELECT scr.request_id, scr.customer_id, scr.branch_id, scr.request_type, scr.amount, scr.notes,
              scr.status, scr.created_at, scr.updated_at,
              c.first_name || ' ' || c.last_name AS customer_name,
              c.customer_code,
              b.name AS branch_name,
              req.full_name AS requested_by_name
       FROM special_collection_requests scr
       JOIN customers c ON c.customer_id = scr.customer_id
       JOIN branches b ON b.id = scr.branch_id
       JOIN users req ON req.id = scr.requested_by
       WHERE ${scope.sql}
       ORDER BY scr.created_at DESC
       LIMIT 200`,
      scope.params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Approvals] GET /special-collections error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load special collection requests.' });
  }
});

router.patch('/special-collections/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const requestId = Number(req.params.id);
    const { status } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const scope = branchFilter(user, 'scr', 4);
    const params = [status, user.id, requestId, ...scope.params];

    const result = await pool.query(
      `UPDATE special_collection_requests scr
       SET status = $1, approved_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE scr.request_id = $3 AND ${scope.sql}
       RETURNING request_id, status`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    await writeAuditFromReq(pool, req, {
      module: 'Approvals',
      activity: `Special Collection ${status}`,
      action: `Special Collection ${status}`,
      description: `${status} special collection request #${requestId}.`,
      status: status === 'Approved' ? AUDIT_STATUS.APPROVED : AUDIT_STATUS.REJECTED,
      affectedRecord: `special_collection:${requestId}`,
    });

    return res.status(200).json({ success: true, message: `Request ${status.toLowerCase()}.`, data: result.rows[0] });
  } catch (err) {
    console.error('[Approvals] PATCH /special-collections/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update request.' });
  }
});

router.get('/sales-invoices', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const scope = branchFilter(user, 'si');
    const result = await pool.query(
      `SELECT
         si.sales_invoices_id,
         si.invoice_number,
         si.customer_id,
         si.sales_agent_id,
         si.branch_id,
         si.total_amount,
         si.status,
         si.pay_type,
         si.term_months,
         si.invoices_date::text AS invoices_date,
         si.due_date::text AS due_date,
         si.notes,
         si.created_at,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name,
         c.customer_code,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', agent.first_name, agent.last_name)), ''), 'Sales Agent') AS sales_agent_name,
         b.name AS branch_name,
         pm.method_name AS payment_method,
         COALESCE(
           json_agg(
             json_build_object(
               'product_name', p.name,
               'quantity', sii.quantity,
               'line_total', sii.line_total
             )
             ORDER BY p.name
           ) FILTER (WHERE sii.sales_invoices_items_id IS NOT NULL),
           '[]'::json
         ) AS items
       FROM sales_invoices si
       LEFT JOIN customers c ON c.customer_id = si.customer_id
       LEFT JOIN users agent ON agent.id = si.sales_agent_id
       LEFT JOIN branches b ON b.id = si.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = si.payment_method_id
       LEFT JOIN sales_invoice_items sii ON sii.invoices_id = si.sales_invoices_id
       LEFT JOIN products p ON p.id = sii.product_id
       WHERE si.status = 'Pending Review' AND ${scope.sql}
       GROUP BY si.sales_invoices_id, c.first_name, c.last_name, c.customer_code,
                agent.first_name, agent.last_name, b.name, pm.method_name,
                si.pay_type, si.term_months
       ORDER BY si.created_at ASC`,
      scope.params
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Approvals] GET /sales-invoices error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load sales invoices for review.' });
  }
});

router.patch('/sales-invoices/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const invoiceId = Number(req.params.id);
  const status = req.body.status === 'Confirmed' ? 'Confirmed' : req.body.status === 'Cancelled' ? 'Cancelled' : null;
  const reviewNote = String(req.body.review_note || '').trim();

  if (!Number.isInteger(invoiceId) || invoiceId <= 0 || !status) {
    return res.status(400).json({ success: false, message: 'Confirm or cancel a valid invoice.' });
  }
  if (status === 'Cancelled' && !reviewNote) {
    return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
  }

  const client = await pool.connect();
  const stockAlerts = [];
  try {
    await client.query('BEGIN');
    const params = [invoiceId];
    let branchSql = 'TRUE';
    if (!isUnscoped(user)) {
      params.push(user.branchId);
      branchSql = `si.branch_id = $${params.length}`;
    }
    const existing = await client.query(
      `SELECT si.sales_invoices_id, si.invoice_number, si.sales_agent_id, si.branch_id,
              si.customer_id, si.total_amount
       FROM sales_invoices si
       WHERE si.sales_invoices_id = $1
         AND si.status = 'Pending Review'
         AND ${branchSql}
       FOR UPDATE`,
      params
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Invoice is not waiting for review in your branch.',
      });
    }
    const invoice = existing.rows[0];

    let reopenedRequest = false;
    if (status === 'Cancelled') {
      const items = await client.query(
        `SELECT product_id, quantity FROM sales_invoice_items WHERE invoices_id = $1 ORDER BY sales_invoices_items_id`,
        [invoiceId]
      );
      for (let index = 0; index < items.rows.length; index += 1) {
        const item = items.rows[index];
        const snapshot = await upsertBranchInventoryStock(client, {
          branchId: invoice.branch_id,
          productId: item.product_id,
          delta: Number(item.quantity),
        });
        stockAlerts.push(snapshot);
        await insertStockMovement(client, {
          performedBy: user.id,
          productId: item.product_id,
          branchId: invoice.branch_id,
          quantity: Number(item.quantity),
          type: 'Sale Reversal',
          movementRef: `REV-${invoice.invoice_number}-${item.product_id}-${index + 1}`,
          movementDate: manilaDateString(),
        });
      }
      const reopened = await client.query(
        `UPDATE purchase_requests
         SET status = 'Confirmed', sales_invoices_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE sales_invoices_id = $1`,
        [invoiceId]
      );
      reopenedRequest = reopened.rowCount > 0;
      await reverseCustomerSaleCharge(client, {
        customerId: invoice.customer_id,
        amount: invoice.total_amount,
      });
    }

    const updated = await client.query(
      `UPDATE sales_invoices
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           review_note = $3
       WHERE sales_invoices_id = $4
       RETURNING sales_invoices_id, invoice_number, status`,
      [status, user.id, reviewNote || null, invoiceId]
    );

    await client.query('COMMIT');
    await publishStockAlerts(pool, stockAlerts);
    await notifyInvoiceReviewDecision(pool, {
      salesAgentId: invoice.sales_agent_id,
      invoiceNumber: invoice.invoice_number,
      status,
      reviewNote,
      reopenedRequest,
    });

    await writeAuditFromReq(pool, req, {
      module: 'Approvals',
      activity: status === 'Confirmed' ? 'Approve Invoice' : 'Reject Invoice',
      action: status === 'Confirmed' ? 'Approve Invoice' : 'Reject Invoice',
      description: status === 'Confirmed'
        ? `Approved sales invoice ${invoice.invoice_number}.`
        : `Rejected sales invoice ${invoice.invoice_number}${reviewNote ? `. Reason: ${reviewNote}` : ''}.`,
      status: status === 'Confirmed' ? AUDIT_STATUS.APPROVED : AUDIT_STATUS.REJECTED,
      affectedRecord: `invoice:${invoiceId}`,
      branchId: invoice.branch_id,
    });

    return res.status(200).json({
      success: true,
      message: status === 'Confirmed'
        ? `Invoice ${invoice.invoice_number} confirmed.`
        : `Invoice ${invoice.invoice_number} rejected. Stock and the unpaid balance were returned.`,
      data: updated.rows[0],
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already finished */ }
    console.error('[Approvals] PATCH /sales-invoices/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to review the invoice.' });
  } finally {
    client.release();
  }
});

router.get('/collections', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const status = req.query.status === 'Completed' ? 'Completed' : 'Pending';
    const scope = branchFilter(user, 'cp');
    const params = [...scope.params, status];
    const statusIndex = params.length;
    const result = await pool.query(
      `SELECT
         cp.collectionpayment_id,
         cp.receipt_number,
         cp.amount,
         cp.status,
         cp.payment_date::text AS payment_date,
         cp.notes,
         cp.review_note,
         cp.reference_number,
         cp.customer_id,
         cp.created_at,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', collector.first_name, collector.last_name)), ''), 'Collector') AS collector_name,
         b.name AS branch_name,
         COALESCE(pm.method_name, 'Cash') AS payment_method
       FROM collection_payment cp
       LEFT JOIN customers c ON c.customer_id = cp.customer_id
       LEFT JOIN users collector ON collector.id = cp.collector_id
       LEFT JOIN branches b ON b.id = cp.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       WHERE ${scope.sql}
         AND cp.status = $${statusIndex}
       ORDER BY cp.created_at ASC
       LIMIT 100`,
      params
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Approvals] GET /collections error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load collections for review.' });
  }
});

router.patch('/collections/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const paymentId = Number(req.params.id);
  const action = req.body.action === 'confirm' || req.body.action === 'reject' || req.body.action === 'reverse'
    ? req.body.action
    : null;
  const reviewNote = String(req.body.review_note || '').trim();
  if (!Number.isInteger(paymentId) || paymentId <= 0 || !action) {
    return res.status(400).json({ success: false, message: 'Confirm, reject, or reverse a valid collection.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const scopedBranchId = isUnscoped(user) ? null : user.branchId;
    let result;
    if (action === 'confirm') {
      result = await confirmCollectionPayment(client, user, paymentId, scopedBranchId, reviewNote, req.ip);
    } else if (action === 'reject') {
      result = await rejectCollectionPayment(client, user, paymentId, scopedBranchId, reviewNote, req.ip);
    } else {
      result = await reverseCollectionPayment(client, user, paymentId, scopedBranchId, reviewNote, req.ip);
    }
    await client.query('COMMIT');
    if (action === 'confirm' && result.remainingBalance === 0) {
      await clearOverdueDedup(pool, result.customerId);
    }
    if (action === 'confirm' || action === 'reverse') await notifyOverdueAccounts(pool);
    const message = action === 'confirm'
      ? `Collection ${result.payment.receipt_number} confirmed. The balance is updated.`
      : action === 'reject'
        ? `Collection ${result.payment.receipt_number} rejected. The balance was left unchanged.`
        : `Collection ${result.payment.receipt_number} reversed. The amount was returned to the balance.`;
    return res.status(200).json({ success: true, message, data: result.payment });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already finished */ }
    if (err.status || err.conflict) {
      return res.status(err.status || 409).json({ success: false, message: err.message });
    }
    console.error('[Approvals] PATCH /collections/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to review the collection.' });
  } finally {
    client.release();
  }
});

router.get('/center-summary', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const scopeCi = branchFilter(user, 'ci');
    const scopeInv = branchFilter(user, 'si');
    const scopePay = branchFilter(user, 'cp');
    const branchParams = isUnscoped(user) ? [] : [user.branchId];

    const [ciPending, transfersPending, invoicesPending, collectionsPending, restocksPending, countsPending] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM credit_investigations ci
           WHERE ci.status IN ('Pending', 'Revision Requested') AND ${scopeCi.sql}`,
          scopeCi.params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM inventory_transfers it
           WHERE it.status IN ('Pending Approval', 'Submitted')
           ${isUnscoped(user) ? '' : 'AND (it.source_branch_id = $1 OR it.destination_branch_id = $1)'}`,
          branchParams
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM sales_invoices si
           WHERE si.status = 'Pending Review' AND ${scopeInv.sql}`,
          scopeInv.params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM collection_payment cp
           WHERE cp.status = 'Pending' AND ${scopePay.sql}`,
          scopePay.params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM restock_headers h
           WHERE h.status = 'Pending Approval'
           ${isUnscoped(user) ? '' : 'AND h.branch_id = $1'}`,
          branchParams
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM stock_count_headers h
           WHERE h.status = 'Pending Approval'
           ${isUnscoped(user) ? '' : 'AND h.branch_id = $1'}`,
          branchParams
        ),
      ]);

    const ci_pending = ciPending.rows[0]?.count || 0;
    const transfers_pending = transfersPending.rows[0]?.count || 0;
    const invoices_pending = invoicesPending.rows[0]?.count || 0;
    const collections_pending = collectionsPending.rows[0]?.count || 0;
    const restocks_pending = restocksPending.rows[0]?.count || 0;
    const stock_counts_pending = countsPending.rows[0]?.count || 0;

    return res.status(200).json({
      success: true,
      data: {
        collections_pending,
        invoices_pending,
        transfers_pending,
        restocks_pending,
        stock_counts_pending,
        ci_pending,
        needs_action:
          collections_pending
          + invoices_pending
          + transfers_pending
          + restocks_pending
          + stock_counts_pending
          + ci_pending,
      },
    });
  } catch (err) {
    console.error('[Approvals] GET /center-summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load approval summary.' });
  }
});

// ── Restock approvals ─────────────────────────────────────────────────────────

router.get('/restocks', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const params = [];
    const conditions = [`h.status = 'Pending Approval'`];
    if (!isUnscoped(user)) {
      params.push(user.branchId);
      conditions.push(`h.branch_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT
         h.restock_id, h.restock_ref, h.delivery_ref, h.received_date, h.notes, h.status,
         h.branch_id, h.supplier_id, h.recorded_by, h.submitted_by, h.submitted_at, h.created_at,
         b.name AS branch_name, s.supplier_name,
         COALESCE(rec.full_name, sub.full_name) AS recorded_by_name,
         sub.full_name AS submitted_by_name,
         COALESCE(agg.line_count, 0)::int AS line_count,
         COALESCE(agg.total_quantity, 0)::int AS total_quantity,
         COALESCE(agg.total_quantity, 0)::int AS quantity,
         CASE
           WHEN COALESCE(agg.line_count, 0) <= 1 THEN agg.first_product_name
           ELSE agg.first_product_name || ' +' || (agg.line_count - 1)::text || ' more'
         END AS product_name
       FROM restock_headers h
       JOIN branches b ON b.id = h.branch_id
       JOIN suppliers s ON s.suppliers_id = h.supplier_id
       LEFT JOIN users rec ON rec.id = h.recorded_by
       LEFT JOIN users sub ON sub.id = COALESCE(h.submitted_by, h.recorded_by)
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS line_count,
           COALESCE(SUM(l.quantity), 0)::int AS total_quantity,
           (ARRAY_AGG(p.name ORDER BY p.name))[1] AS first_product_name
         FROM restock_lines l
         JOIN products p ON p.id = l.product_id
         WHERE l.restock_id = h.restock_id
       ) agg ON TRUE
       WHERE ${conditions.join(' AND ')}
       ORDER BY h.submitted_at ASC NULLS FIRST, h.created_at ASC
       LIMIT 200`,
      params
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Approvals] GET /restocks error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load restock approvals.' });
  }
});

router.get('/restocks/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const restockId = Number(req.params.id);
    const params = [restockId];
    let branchSql = '';
    if (!isUnscoped(user)) {
      branchSql = ' AND h.branch_id = $2';
      params.push(user.branchId);
    }
    const header = await pool.query(
      `SELECT h.*, b.name AS branch_name, s.supplier_name,
              rec.full_name AS recorded_by_name,
              sub.full_name AS submitted_by_name
       FROM restock_headers h
       JOIN branches b ON b.id = h.branch_id
       JOIN suppliers s ON s.suppliers_id = h.supplier_id
       LEFT JOIN users rec ON rec.id = h.recorded_by
       LEFT JOIN users sub ON sub.id = COALESCE(h.submitted_by, h.recorded_by)
       WHERE h.restock_id = $1${branchSql}`,
      params
    );
    if (!header.rows.length) {
      return res.status(404).json({ success: false, message: 'Restock not found.' });
    }
    const lines = await loadRestockLines(pool, restockId);
    const summary = summarizeLines(lines);
    return res.status(200).json({
      success: true,
      data: { ...header.rows[0], ...summary, lines },
    });
  } catch (err) {
    console.error('[Approvals] GET /restocks/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load restock.' });
  }
});

router.patch('/restocks/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const restockId = Number(req.params.id);
  const decision = String(req.body.status || req.body.decision || '').trim();
  const reason = String(req.body.decision_remarks || req.body.reason || req.body.approval_info || '').trim();

  if (!['Approved', 'Rejected', 'Posted'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'status must be Approved or Rejected.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM restock_headers WHERE restock_id = $1 FOR UPDATE`,
      [restockId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Restock not found.' });
    }
    const row = existing.rows[0];
    if (!isUnscoped(user) && Number(row.branch_id) !== Number(user.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Restock is outside your branch.' });
    }
    if (row.status === 'Posted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Restock is already posted.' });
    }
    if (row.status !== 'Pending Approval') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot decide restock in status ${row.status}.`,
      });
    }

    const submitterId = row.submitted_by || row.recorded_by;
    if (submitterId && Number(submitterId) === Number(user.id) && user.roleSlug !== 'super_admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'You cannot approve a restock you submitted.',
      });
    }

    if (decision === 'Rejected') {
      if (!reason) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
      }
      const updated = await client.query(
        `UPDATE restock_headers
         SET status = 'Rejected',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP,
             decision_remarks = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE restock_id = $3
         RETURNING *`,
        [user.id, reason, restockId]
      );
      await client.query('COMMIT');
      await notifyRestockDecision(pool, {
        submitterId,
        restockRef: row.restock_ref,
        status: 'Rejected',
        rejectionReason: reason,
      });
      await logWarehouseAudit(pool, user.id, 'Restock rejected', row.restock_ref, req.ip, {
        branchId: row.branch_id,
        affectedRecord: `restock:${restockId}`,
      });
      await writeAuditFromReq(pool, req, {
        module: 'Approvals',
        activity: 'Restock rejected',
        action: 'Restock rejected',
        description: `Rejected restock ${row.restock_ref}. Reason: ${reason}`,
        status: AUDIT_STATUS.REJECTED,
        affectedRecord: `restock:${restockId}`,
        branchId: row.branch_id,
      });
      return res.status(200).json({
        success: true,
        message: 'Restock rejected. No stock changes were made.',
        data: updated.rows[0],
      });
    }

    const lines = await loadRestockLines(client, restockId);
    if (!lines.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Restock has no product lines.' });
    }

    const snapshots = await postRestockStock(client, {
      restockRef: row.restock_ref,
      deliveryRef: row.delivery_ref,
      branchId: row.branch_id,
      supplierId: row.supplier_id,
      receivedDate: row.received_date || manilaToday(),
      postedBy: user.id,
      lines,
    });

    const updated = await client.query(
      `UPDATE restock_headers
       SET status = 'Posted',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           posted_by = $1,
           posted_at = CURRENT_TIMESTAMP,
           decision_remarks = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE restock_id = $3
       RETURNING *`,
      [user.id, reason || null, restockId]
    );
    await client.query('COMMIT');
    if (snapshots.length) await publishStockAlerts(pool, snapshots);

    const summary = summarizeLines(lines);
    await notifyRestockDecision(pool, {
      submitterId,
      restockRef: row.restock_ref,
      status: 'Posted',
    });
    await notifyRestockRecorded(pool, {
      userId: submitterId,
      restockRef: row.restock_ref,
      deliveryRef: row.delivery_ref,
      lineCount: summary.line_count,
      totalQuantity: summary.total_quantity,
    });
    await logWarehouseAudit(
      pool,
      user.id,
      'Restock approved & posted',
      `${row.restock_ref}: +${summary.total_quantity} units`,
      req.ip,
      { branchId: row.branch_id, affectedRecord: `restock:${restockId}` }
    );
    await writeAuditFromReq(pool, req, {
      module: 'Approvals',
      activity: 'Restock approved & posted',
      action: 'Restock approved & posted',
      description: `Approved and posted restock ${row.restock_ref}: ${summary.line_count} lines, +${summary.total_quantity} units.`,
      status: AUDIT_STATUS.APPROVED,
      affectedRecord: `restock:${restockId}`,
      branchId: row.branch_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Restock approved and stock posted.',
      data: { ...updated.rows[0], ...summary, lines },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Approvals] PATCH /restocks/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to decide restock.' });
  } finally {
    client.release();
  }
});

// ── Stock count approvals ─────────────────────────────────────────────────────

router.get('/stock-counts', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const params = [];
    const conditions = [`h.status = 'Pending Approval'`];
    if (!isUnscoped(user)) {
      params.push(user.branchId);
      conditions.push(`h.branch_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT
         h.count_id, h.count_ref, h.branch_id, h.counted_by, h.notes, h.status, h.created_at,
         b.name AS branch_name, u.full_name AS counted_by_name,
         COALESCE(agg.line_count, 0)::int AS line_count,
         COALESCE(agg.discrepancy_count, 0)::int AS discrepancy_count
       FROM stock_count_headers h
       JOIN branches b ON b.id = h.branch_id
       LEFT JOIN users u ON u.id = h.counted_by
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS line_count,
           COUNT(*) FILTER (WHERE l.variance <> 0)::int AS discrepancy_count
         FROM stock_count_lines l
         WHERE l.count_id = h.count_id
       ) agg ON TRUE
       WHERE ${conditions.join(' AND ')}
       ORDER BY h.created_at ASC
       LIMIT 200`,
      params
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Approvals] GET /stock-counts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stock count approvals.' });
  }
});

router.get('/stock-counts/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const countId = Number(req.params.id);
    const params = [countId];
    let branchSql = '';
    if (!isUnscoped(user)) {
      branchSql = ' AND h.branch_id = $2';
      params.push(user.branchId);
    }
    const header = await pool.query(
      `SELECT h.*, b.name AS branch_name, u.full_name AS counted_by_name
       FROM stock_count_headers h
       JOIN branches b ON b.id = h.branch_id
       LEFT JOIN users u ON u.id = h.counted_by
       WHERE h.count_id = $1${branchSql}`,
      params
    );
    if (!header.rows.length) {
      return res.status(404).json({ success: false, message: 'Stock count not found.' });
    }
    const lines = await pool.query(
      `SELECT l.*, p.name AS product_name, p.sku
       FROM stock_count_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.count_id = $1
       ORDER BY p.name`,
      [countId]
    );
    const discrepancyCount = lines.rows.filter((l) => Number(l.variance) !== 0).length;
    return res.status(200).json({
      success: true,
      data: {
        ...header.rows[0],
        line_count: lines.rows.length,
        discrepancy_count: discrepancyCount,
        lines: lines.rows,
      },
    });
  } catch (err) {
    console.error('[Approvals] GET /stock-counts/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stock count.' });
  }
});

router.patch('/stock-counts/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const countId = Number(req.params.id);
  const decision = String(req.body.status || req.body.decision || '').trim();
  const reason = String(req.body.decision_remarks || req.body.reason || req.body.approval_info || '').trim();

  if (!['Approved', 'Rejected', 'Completed'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'status must be Approved or Rejected.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM stock_count_headers WHERE count_id = $1 FOR UPDATE`,
      [countId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Stock count not found.' });
    }
    const row = existing.rows[0];
    if (!isUnscoped(user) && Number(row.branch_id) !== Number(user.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Stock count is outside your branch.' });
    }
    if (row.status === 'Completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Stock count is already completed.' });
    }
    if (row.status !== 'Pending Approval') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot decide stock count in status ${row.status}.`,
      });
    }
    if (row.counted_by && Number(row.counted_by) === Number(user.id) && user.roleSlug !== 'super_admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'You cannot approve a stock count you submitted.',
      });
    }

    if (decision === 'Rejected') {
      if (!reason) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
      }
      const updated = await client.query(
        `UPDATE stock_count_headers
         SET status = 'Rejected',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP,
             decision_remarks = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE count_id = $3
         RETURNING *`,
        [user.id, reason, countId]
      );
      await client.query('COMMIT');
      await notifyStockCountDecision(pool, {
        submitterId: row.counted_by,
        countRef: row.count_ref,
        status: 'Rejected',
        rejectionReason: reason,
      });
      try {
        const { resolveAlertsBySourceKey } = await import('../lib/operationalAlerts.js');
        await resolveAlertsBySourceKey(pool, `stock_count:${countId}`, {
          resolvedBy: user.id,
          resolutionNote: `Stock count rejected. ${reason || ''}`.trim(),
        });
      } catch (alertErr) {
        console.error('[Approvals] stock count alert resolve:', alertErr.message);
      }
      await logWarehouseAudit(pool, user.id, 'Stock count rejected', row.count_ref, req.ip);
      return res.status(200).json({
        success: true,
        message: 'Stock count rejected. No inventory adjustments were made.',
        data: updated.rows[0],
      });
    }

    const linesRes = await client.query(
      `SELECT l.*, bi.reorder_level
       FROM stock_count_lines l
       LEFT JOIN branch_inventory bi
         ON bi.branch_id = $2 AND bi.product_id = l.product_id
       WHERE l.count_id = $1`,
      [countId, row.branch_id]
    );
    const lines = linesRes.rows.map((l) => ({
      ...l,
      reorder_level: l.reorder_level,
    }));
    const snapshots = await postStockCountAdjustments(client, {
      countRef: row.count_ref,
      branchId: row.branch_id,
      postedBy: user.id,
      lines,
    });

    const updated = await client.query(
      `UPDATE stock_count_headers
       SET status = 'Completed',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           decision_remarks = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE count_id = $3
       RETURNING *`,
      [user.id, reason || null, countId]
    );
    await client.query('COMMIT');
    if (snapshots.length) await publishStockAlerts(pool, snapshots);

    await notifyStockCountDecision(pool, {
      submitterId: row.counted_by,
      countRef: row.count_ref,
      status: 'Completed',
    });
    try {
      const { resolveAlertsBySourceKey } = await import('../lib/operationalAlerts.js');
      await resolveAlertsBySourceKey(pool, `stock_count:${countId}`, {
        resolvedBy: user.id,
        resolutionNote: 'Stock count approved; inventory adjustments posted.',
      });
    } catch (alertErr) {
      console.error('[Approvals] stock count alert resolve:', alertErr.message);
    }
    await logWarehouseAudit(
      pool,
      user.id,
      'Stock count approved',
      `${row.count_ref}: ${snapshots.length} adjustment(s)`,
      req.ip
    );

    return res.status(200).json({
      success: true,
      message: 'Stock count approved and inventory adjustments posted.',
      data: updated.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Approvals] PATCH /stock-counts/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to decide stock count.' });
  } finally {
    client.release();
  }
});

// ── Credit recommendations (proactive candidates — not formal CI) ─────────────

router.post('/credit-recommendations/evaluate', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const branchId = isUnscoped(user)
      ? (req.body?.branch_id != null ? Number(req.body.branch_id) : user.branchId)
      : user.branchId;
    if (branchId == null) {
      return res.status(400).json({ success: false, message: 'branch_id is required.' });
    }
    if (!isUnscoped(user) && Number(branchId) !== Number(user.branchId)) {
      return res.status(403).json({ success: false, message: 'Cannot evaluate another branch.' });
    }
    const result = await evaluateBranchCreditRecommendations(pool, {
      branchId,
      limit: req.body?.limit || 200,
    });
    await writeAuditFromReq(pool, req, {
      module: 'Credit Approvals',
      activity: 'Evaluate Credit Recommendations',
      action: 'Evaluate Credit Recommendations',
      description: `Evaluated branch #${branchId} credit recommendations (created ${result.created}, refreshed ${result.refreshed}).`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `branch:${branchId}`,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[Approvals] POST /credit-recommendations/evaluate error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to evaluate recommendations.' });
  }
});

router.get('/credit-recommendations', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const branchId = isUnscoped(user)
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : user.branchId;
    const result = await listCreditRecommendations(pool, {
      branchId,
      status: req.query.status || null,
      recommendationType: req.query.recommendation_type || null,
      riskLevel: req.query.risk_level || null,
      search: req.query.search || null,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: result.total,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25,
        totalPages: Math.ceil(result.total / (Number(req.query.limit) || 25)) || 0,
      },
    });
  } catch (err) {
    console.error('[Approvals] GET /credit-recommendations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load recommendations.' });
  }
});

router.patch('/credit-recommendations/:id', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const user = req.currentUser;
    const recommendationId = Number(req.params.id);
    const status = String(req.body?.status || '').trim();
    await client.query('BEGIN');
    const row = await updateRecommendationStatus(client, {
      recommendationId,
      branchId: isUnscoped(user) ? null : user.branchId,
      status,
      dismissedReason: req.body?.dismissed_reason || req.body?.reason || null,
      actorId: user.id,
    });
    await client.query('COMMIT');
    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Credit Approvals',
      activity: `Credit Recommendation ${status}`,
      action: `Credit Recommendation ${status}`,
      description: `Updated recommendation #${recommendationId} to ${status}.`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `credit_recommendation:${recommendationId}`,
    });
    return res.status(200).json({ success: true, data: row });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[Approvals] PATCH /credit-recommendations/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update recommendation.' });
  } finally {
    client.release();
  }
});

router.post('/credit-recommendations/:id/convert', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const user = req.currentUser;
    const recommendationId = Number(req.params.id);
    await client.query('BEGIN');
    const converted = await convertRecommendationToCi(client, {
      recommendationId,
      branchId: isUnscoped(user) ? null : user.branchId,
      submittedBy: user.id,
      requestReason: req.body?.request_reason || null,
      requestedCreditLimit: req.body?.requested_credit_limit,
      requestRemarks: req.body?.request_remarks || null,
    });
    await client.query('COMMIT');

    const customerName = converted.created.evidence?.customer?.name || 'Customer';
    await notifyCreditInvestigationSubmitted(req.app.locals.pool, {
      branchId: converted.recommendation.branch_id,
      ciId: converted.created.row.ci_id,
      customerName,
      submitterName: user.fullName || user.email || 'Branch Manager',
    });
    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Credit Approvals',
      activity: 'Convert Credit Recommendation',
      action: 'Convert Credit Recommendation',
      description: `Converted recommendation #${recommendationId} into CI #${converted.created.row.ci_id} for ${customerName}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `credit_investigation:${converted.created.row.ci_id}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Recommendation converted into a formal credit investigation.',
      data: {
        recommendation_id: recommendationId,
        ci_id: converted.created.row.ci_id,
        review: mapCreditReviewApiRow({
          ...converted.created.row,
          customer_id: converted.recommendation.customer_id,
        }),
      },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    if (err.status === 409) {
      return res.status(409).json({
        success: false,
        message: err.message,
        data: err.existingId ? { ci_id: err.existingId } : undefined,
      });
    }
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[Approvals] POST /credit-recommendations/:id/convert error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to convert recommendation.' });
  } finally {
    client.release();
  }
});

export default router;
