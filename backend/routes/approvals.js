import express from 'express';
import { requireAuth, isUnscoped, ROLE_SETS, requireRole } from '../middleware/auth.js';
import {
  CREDIT_INVESTIGATION_FROM,
  CREDIT_INVESTIGATION_SELECT,
} from '../lib/creditInvestigationQueries.js';
import { notifyCreditInvestigationDecision } from '../lib/creditInvestigationNotifications.js';

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
