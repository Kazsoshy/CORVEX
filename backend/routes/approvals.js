import express from 'express';
import { requireAuth, isUnscoped, ROLE_SETS, requireRole } from '../middleware/auth.js';
import {
  CREDIT_INVESTIGATION_FROM,
  CREDIT_INVESTIGATION_SELECT,
} from '../lib/creditInvestigationQueries.js';
import { notifyCreditInvestigationDecision } from '../lib/creditInvestigationNotifications.js';
import { upsertBranchInventoryStock, insertStockMovement } from '../lib/branchInventoryStock.js';
import { reverseCustomerSaleCharge } from '../lib/salesInvoiceWrite.js';
import { publishStockAlerts, notifyInvoiceReviewDecision, clearOverdueDedup, notifyOverdueAccounts } from '../lib/operationalNotifications.js';
import { manilaDateString } from '../lib/sawCollection.js';
import {
  confirmCollectionPayment,
  rejectCollectionPayment,
  reverseCollectionPayment,
} from '../lib/collectionPayment.js';

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
    const { status } = req.query;
    const scope = branchFilter(user, 'ci');
    const params = [...scope.params];
    let idx = params.length + 1;
    let statusSql = '';
    if (status && status !== 'All') {
      statusSql = ` AND ci.status = $${idx++}`;
      params.push(status);
    }

    const result = await pool.query(
      `SELECT ${CREDIT_INVESTIGATION_SELECT}
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ${scope.sql}${statusSql}
       ORDER BY ci.created_at DESC
       LIMIT 200`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Approvals] GET /credit-investigations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load credit investigations.' });
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
      return res.status(404).json({ success: false, message: 'Credit investigation not found.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Approvals] GET /credit-investigations/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load credit investigation.' });
  }
});

router.patch('/credit-investigations/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const ciId = Number(req.params.id);
    const { status, rejection_reason: rejectionReason } = req.body;
    const allowed = new Set(['Approved', 'Rejected', 'Revision Requested']);
    if (!allowed.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    if (status === 'Rejected' && !String(rejectionReason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const scope = branchFilter(user, 'ci', 5);
    const params = [status, user.id, rejectionReason || null, ciId, ...scope.params];

    const before = await pool.query(
      `SELECT ci.submitted_by, c.first_name || ' ' || c.last_name AS customer_name
       FROM credit_investigations ci
       JOIN customers c ON c.customer_id = ci.customer_id
       WHERE ci.ci_id = $1`,
      [ciId]
    );

    const result = await pool.query(
      `UPDATE credit_investigations ci
       SET status = $1,
           approved_by = $2,
           rejection_reason = COALESCE($3, rejection_reason),
           updated_at = CURRENT_TIMESTAMP
       WHERE ci.ci_id = $4 AND ${scope.sql}
       RETURNING ci_id, status`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Credit investigation not found.' });
    }

    const meta = before.rows[0];
    if (meta) {
      await notifyCreditInvestigationDecision(pool, {
        submitterId: meta.submitted_by,
        ciId,
        customerName: meta.customer_name,
        status,
        rejectionReason: rejectionReason || null,
      });
    }

    if (status === 'Approved') {
      await pool.query(
        `UPDATE customer_credit_info cci
         SET approved_by = $1, approved_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
         FROM credit_investigations ci
         WHERE ci.ci_id = $2 AND cci.customer_id = ci.customer_id`,
        [user.id, ciId]
      );
    }

    return res.status(200).json({ success: true, message: `CI ${status.toLowerCase()}.`, data: result.rows[0] });
  } catch (err) {
    console.error('[Approvals] PATCH /credit-investigations/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update credit investigation.' });
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
                agent.first_name, agent.last_name, b.name, pm.method_name
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
         cp.customer_id,
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
       ORDER BY cp.created_at DESC
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
    const scopeScr = branchFilter(user, 'scr', 1);

    const [ciPending, scrPending, transfersPending] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count FROM credit_investigations ci WHERE ci.status = 'Pending' AND ${scopeCi.sql}`,
        scopeCi.params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM special_collection_requests scr WHERE scr.status = 'Pending' AND ${scopeScr.sql}`,
        scopeScr.params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM inventory_transfers it
         WHERE it.status IN ('Pending Approval', 'Submitted')
         ${isUnscoped(user) ? '' : 'AND (it.source_branch_id = $1 OR it.destination_branch_id = $1)'}`,
        isUnscoped(user) ? [] : [user.branchId]
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ci_pending: ciPending.rows[0]?.count || 0,
        special_pending: scrPending.rows[0]?.count || 0,
        transfers_pending: transfersPending.rows[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error('[Approvals] GET /center-summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load approval summary.' });
  }
});

export default router;
