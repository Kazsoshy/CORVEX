import express from 'express';
import { requireRole, isUnscoped } from '../middleware/auth.js';
import {
  purchaseRequestListFilter,
  userCanManagePurchaseRequest,
  assignSalesAgentToCustomer,
  getPurchaseRequestDetail,
  purchaseRequestStatusMove,
  confirmBlockReason,
  notifyPurchaseRequestCustomer,
} from '../lib/purchaseRequests.js';
import {
  CREDIT_INVESTIGATION_FROM,
  CREDIT_INVESTIGATION_SELECT,
} from '../lib/creditInvestigationQueries.js';
import { notifyCreditInvestigationSubmitted } from '../lib/creditInvestigationNotifications.js';
import {
  buildCustomerCreditEvidence,
  createCreditReview,
  mapCreditReviewApiRow,
} from '../lib/creditReview.js';
import { applySalesInvoice } from '../lib/salesInvoiceWrite.js';
import {
  notifyInvoicePendingReview,
  notifyOverdueAccounts,
  notifyScheduleAssigned,
  publishStockAlerts,
} from '../lib/operationalNotifications.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';
import {
  AREA_ASSIGNMENT_FROM,
  AREA_ASSIGNMENT_SELECT,
  AREA_ASSIGNMENT_STATUSES,
  fetchAssignmentOutcomeStats,
  loadAssignmentProducts,
  resolveScopeDates,
  withProducts,
} from '../lib/salesAreaAssignments.js';

const router = express.Router();

const VISIT_TYPES = new Set(['Collection', 'Sales']);
const VISIT_STATUSES = new Set(['Pending', 'Completed']);

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isValidDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

async function getInvoice(invoiceIdentifier, user) {
  const pool = user.pool;
  const identifier = String(invoiceIdentifier || '').trim();

  if (!identifier) return null;

  const conditions = ['(si.sales_invoices_id::text = $1 OR si.invoice_number = $1)'];
  const params = [identifier];

  if (user.roleSlug === 'sales_staff') {
    conditions.push('si.sales_agent_id = $2');
    params.push(user.id);
  } else if (!isUnscoped(user)) {
    conditions.push('si.branch_id = $2');
    params.push(user.branchId);
  }

  const result = await pool.query(
    `SELECT
       si.sales_invoices_id,
       si.invoice_number,
       si.customer_id,
       c.first_name,
       c.middle_name,
       c.last_name,
       COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
       si.sales_agent_id,
       agent.full_name AS sales_agent_name,
       si.branch_id,
       b.name AS branch_name,
       si.total_amount,
       si.status,
       si.invoices_date::text AS invoices_date,
       si.due_date::text AS due_date,
       si.notes,
       si.pay_type,
       si.down_payment,
       si.term_months,
       si.monthly_amount,
       si.first_due_date::text AS first_due_date,
       pm.method_name AS payment_method,
       si.created_at,
       si.updated_at
     FROM sales_invoices si
     LEFT JOIN customers c ON c.customer_id = si.customer_id
     LEFT JOIN users agent ON agent.id = si.sales_agent_id
     LEFT JOIN branches b ON b.id = si.branch_id
     LEFT JOIN payment_methods pm ON pm.payment_method_id = si.payment_method_id
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  return result.rows[0] || null;
}

async function getInvoiceItems(invoiceId, user) {
  const result = await user.pool.query(
    `SELECT
       sii.sales_invoices_items_id,
       sii.invoices_id AS invoice_id,
       sii.product_id,
       p.name AS product_name,
       p.sku,
       sii.quantity,
       sii.unit_price,
       sii.line_total,
       sii.created_at
     FROM sales_invoice_items sii
     JOIN products p ON p.id = sii.product_id
     WHERE sii.invoices_id = $1
     ORDER BY sii.sales_invoices_items_id`,
    [invoiceId]
  );

  return result.rows;
}

async function getVisit(pool, visitId, userId) {
  const result = await pool.query(
    `SELECT
       fv.visit_id,
       fv.customer_id,
       c.first_name,
       c.middle_name,
       c.last_name,
       COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
       c.address,
       c.latitude,
       c.longitude,
       c.contact_phone,
       c.contact_person_fname,
       c.contact_person_mname,
       c.contact_person_lname,
       c.contact_person_phone,
       c.status AS customer_status,
       fv.user_id,
       u.first_name AS agent_first_name,
       u.last_name AS agent_last_name,
       COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Sales Agent') AS agent_name,
       fv.visit_type,
       fv.scheduled_date::text AS scheduled_date,
       fv.status,
       fv.created_at,
       fv.updated_at
     FROM field_visits fv
     JOIN customers c ON c.customer_id = fv.customer_id
     JOIN users u ON u.id = fv.user_id
     WHERE fv.visit_id = $1
       AND fv.user_id = $2`,
    [visitId, userId]
  );

  return result.rows[0] || null;
}

const salesStaffOnly = requireRole(['sales_staff']);
const salesStaffOrOperatingManager = requireRole(['sales_staff', 'operating_manager', 'branch_manager']);

function manilaTodayString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function assertSalesCustomerAccess(pool, user, customerId) {
  const result = await pool.query(
    `SELECT customer_id, branch_id, assigned_sales_agent_id
     FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  if (!result.rows.length) return { ok: false, status: 404, message: 'Customer not found.' };
  const row = result.rows[0];
  if (user.branchId != null && row.branch_id !== user.branchId) {
    return { ok: false, status: 403, message: 'Customer is outside your branch.' };
  }
  if (user.roleSlug === 'sales_staff' && row.assigned_sales_agent_id != null && row.assigned_sales_agent_id !== user.id) {
    const visit = await pool.query(
      `SELECT 1 FROM field_visits WHERE customer_id = $1 AND user_id = $2 LIMIT 1`,
      [customerId, user.id]
    );
    if (!visit.rows.length) {
      return { ok: false, status: 403, message: 'Customer is not assigned to you.' };
    }
  }
  return { ok: true, row };
}

router.get('/dashboard', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const userId = user.id;
    const branchId = user.branchId;
    const today = manilaTodayString();

    const [
      areasToday,
      salesPeriods,
      recentSales,
      topProducts,
      topCustomers,
      lowStock,
      ciCounts,
      actionableCredits,
    ] = await Promise.all([
      pool.query(
        `SELECT ${AREA_ASSIGNMENT_SELECT}
         ${AREA_ASSIGNMENT_FROM}
         WHERE saa.sales_agent_id = $1
           AND saa.work_date = $2::date
         ORDER BY
           CASE saa.status
             WHEN 'In Progress' THEN 0
             WHEN 'Assigned' THEN 1
             ELSE 2
           END,
           saa.assignment_id ASC`,
        [userId, today]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(total_amount) FILTER (WHERE invoices_date = $2::date), 0) AS daily,
           COALESCE(SUM(total_amount) FILTER (WHERE invoices_date >= $2::date - 6), 0) AS weekly,
           COALESCE(SUM(total_amount) FILTER (WHERE invoices_date >= date_trunc('month', $2::date)::date), 0) AS monthly,
           COUNT(*) FILTER (WHERE invoices_date = $2::date)::int AS sales_logged_today
         FROM sales_invoices
         WHERE sales_agent_id = $1
           AND status IN ('Pending Review', 'Confirmed', 'Cancelled', 'Draft')`,
        [userId, today]
      ),
      pool.query(
        `SELECT si.sales_invoices_id, si.invoice_number, si.total_amount, si.status,
                si.invoices_date::text AS invoices_date,
                COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
         FROM sales_invoices si
         LEFT JOIN customers c ON c.customer_id = si.customer_id
         WHERE si.sales_agent_id = $1
         ORDER BY si.invoices_date DESC, si.sales_invoices_id DESC
         LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT p.name, SUM(sii.quantity)::int AS units
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.sales_invoices_id = sii.invoices_id
         JOIN products p ON p.id = sii.product_id
         WHERE si.sales_agent_id = $1 AND si.invoices_date >= $2::date - 30
         GROUP BY p.name
         ORDER BY units DESC
         LIMIT 5`,
        [userId, today]
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS name,
                SUM(si.total_amount) AS revenue
         FROM sales_invoices si
         JOIN customers c ON c.customer_id = si.customer_id
         WHERE si.sales_agent_id = $1 AND si.invoices_date >= $2::date - 90
         GROUP BY c.customer_id, c.first_name, c.last_name
         ORDER BY revenue DESC
         LIMIT 5`,
        [userId, today]
      ),
      branchId
        ? pool.query(
            `SELECT
               p.id,
               p.name,
               p.sku,
               COALESCE(bi.available_stock, bi.quantity, 0)::int AS stock,
               bi.reorder_level,
               b.name AS branch,
               CASE
                 WHEN COALESCE(bi.available_stock, bi.quantity, 0) <= 0 THEN 'Out'
                 WHEN COALESCE(bi.reorder_level, 0) > 0
                   AND COALESCE(bi.available_stock, bi.quantity, 0) <= COALESCE(bi.reorder_level, 0)
                   THEN 'Low'
                 ELSE 'Sufficient'
               END AS status
             FROM branch_inventory bi
             JOIN products p ON p.id = bi.product_id AND p.status = 'Active'
             JOIN branches b ON b.id = bi.branch_id
             WHERE bi.branch_id = $1
               AND (
                 COALESCE(bi.available_stock, bi.quantity, 0) <= 0
                 OR (
                   COALESCE(bi.reorder_level, 0) > 0
                   AND COALESCE(bi.available_stock, bi.quantity, 0) <= COALESCE(bi.reorder_level, 0)
                 )
               )
             ORDER BY COALESCE(bi.available_stock, bi.quantity, 0) ASC
             LIMIT 8`,
            [branchId]
          )
        : Promise.resolve({ rows: [] }),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status IN ('Pending', 'Revision Requested'))::int AS pending,
           COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved,
           COUNT(*) FILTER (WHERE status IN ('Rejected', 'Revision Requested'))::int AS needs_action
         FROM credit_investigations
         WHERE submitted_by = $1`,
        [userId]
      ),
      pool.query(
        `SELECT
           ci.ci_id,
           ci.status,
           ci.request_reason,
           ci.purpose,
           ci.updated_at,
           ci.created_at,
           COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
         FROM credit_investigations ci
         JOIN customers c ON c.customer_id = ci.customer_id
         WHERE ci.submitted_by = $1
           AND ci.status IN ('Rejected', 'Revision Requested')
         ORDER BY ci.updated_at DESC NULLS LAST, ci.created_at DESC
         LIMIT 5`,
        [userId]
      ),
    ]);

    const assignments = areasToday.rows || [];
    const areasAssigned = assignments.length;
    const areasDone = assignments.filter((row) => row.status === 'Done').length;
    const areasInProgress = assignments.filter((row) => row.status === 'In Progress').length;
    const sp = salesPeriods.rows[0] || {};
    const ciRow = ciCounts.rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          areasAssignedToday: areasAssigned,
          areasCompletedToday: areasDone,
          areasInProgressToday: areasInProgress,
          areaProgress: areasAssigned > 0 ? Math.round((areasDone / areasAssigned) * 100) : 0,
          salesLogged: Number(sp.sales_logged_today) || 0,
          creditInvestigationsPending: Number(ciRow.pending) || 0,
          creditInvestigationsNeedsAction: Number(ciRow.needs_action) || 0,
          creditInvestigationsTotal: Number(ciRow.total) || 0,
          // Legacy aliases kept so older clients don't crash
          accountsToVisit: areasAssigned,
          completedVisits: areasDone,
          pendingVisits: Math.max(0, areasAssigned - areasDone),
          visitProgress: areasAssigned > 0 ? Math.round((areasDone / areasAssigned) * 100) : 0,
        },
        todayAssignments: assignments.map((row) => ({
          assignmentId: row.assignment_id,
          areaName: row.area_name,
          workDate: row.work_date,
          status: row.status,
          coverageNotes: row.coverage_notes || null,
          territoryName: row.territory_name || null,
          branchName: row.branch_name || null,
        })),
        analytics: {
          dailyRevenue: Number(sp.daily) || 0,
          weeklyRevenue: Number(sp.weekly) || 0,
          monthlyRevenue: Number(sp.monthly) || 0,
          topProducts: topProducts.rows.map((r) => ({ name: r.name, units: r.units })),
          topCustomers: topCustomers.rows.map((r) => ({
            name: r.name,
            revenue: Number(r.revenue) || 0,
          })),
        },
        recentSales: recentSales.rows.map((r) => ({
          id: r.sales_invoices_id,
          invoiceNumber: r.invoice_number,
          customerName: r.customer_name,
          totalAmount: Number(r.total_amount) || 0,
          status: r.status,
          date: r.invoices_date,
        })),
        lowStockItems: lowStock.rows.map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          stock: r.stock,
          status: r.status,
          branch: r.branch,
          reorderLevel: r.reorder_level,
        })),
        creditReviewsNeedingAttention: actionableCredits.rows.map((r) => ({
          id: r.ci_id,
          status: r.status,
          customerName: r.customer_name,
          reason: r.request_reason || r.purpose || null,
          updatedAt: r.updated_at || r.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('[Sales] GET /dashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
});

router.post('/credit-investigations', salesStaffOnly, async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const user = req.currentUser;
    const customerId = Number(req.body.customer_id);
    const requestReason = req.body.request_reason || req.body.purpose;
    const requestedCreditLimit = req.body.requested_credit_limit;
    const requestRemarks = req.body.request_remarks || req.body.form_remarks;

    if (!Number.isFinite(customerId)) {
      return res.status(400).json({ success: false, message: 'Customer is required.' });
    }

    const access = await assertSalesCustomerAccess(client, user, customerId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const submitterMeta = await client.query(
      `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
      [user.id]
    );
    const submitterName = submitterMeta.rows[0]?.display_name || 'Sales agent';

    await client.query('BEGIN');
    const created = await createCreditReview(client, {
      customerId,
      branchId: access.row.branch_id,
      submittedBy: user.id,
      requestReason,
      requestedCreditLimit,
      requestRemarks,
    });
    await client.query('COMMIT');

    const customerName = created.evidence?.customer?.name || 'Customer';
    await notifyCreditInvestigationSubmitted(req.app.locals.pool, {
      branchId: access.row.branch_id,
      ciId: created.row.ci_id,
      customerName,
      submitterName,
    });

    await writeAuditFromReq(pool, req, {
      module: 'Sales',
      activity: 'Submit Credit Investigation',
      action: 'Submit Credit Investigation',
      description: `Submitted credit investigation for ${customerName}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `credit_investigation:${ciId}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Credit review submitted for Branch Manager decision.',
      data: {
        ...created.row,
        customer_id: customerId,
        customer_name: customerName,
        risk_level: created.row.risk_level,
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
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('[Sales] POST /credit-investigations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit credit review.' });
  } finally {
    client.release();
  }
});

router.get('/credit-investigations', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const status = String(req.query.status || '').replace(/\+/g, ' ').trim();
    const params = [user.id];
    let statusSql = '';
    if (status && status !== 'All') {
      if (status === 'Needs BM' || status === 'Pending' || status === 'needs_bm') {
        statusSql = ` AND ci.status IN ('Pending', 'Revision Requested')`;
      } else {
        statusSql = ' AND ci.status = $2';
        params.push(status);
      }
    }

    const result = await pool.query(
      `SELECT ${CREDIT_INVESTIGATION_SELECT}
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ci.submitted_by = $1${statusSql}
       ORDER BY ci.created_at DESC
       LIMIT 200`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => mapCreditReviewApiRow(row)),
    });
  } catch (err) {
    console.error('[Sales] GET /credit-investigations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load your credit reviews.' });
  }
});

router.get('/credit-investigations/:id', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const ciId = Number(req.params.id);
    if (!Number.isFinite(ciId)) {
      return res.status(400).json({ success: false, message: 'Invalid credit review id.' });
    }

    const result = await pool.query(
      `SELECT ${CREDIT_INVESTIGATION_SELECT}
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ci.ci_id = $1 AND ci.submitted_by = $2`,
      [ciId, user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Credit review not found.' });
    }

    const row = result.rows[0];
    let liveEvidence = null;
    if (row.status === 'Pending' || row.status === 'Revision Requested') {
      liveEvidence = await buildCustomerCreditEvidence(pool, row.customer_id);
    }

    return res.status(200).json({
      success: true,
      data: mapCreditReviewApiRow(row, { liveEvidence }),
    });
  } catch (err) {
    console.error('[Sales] GET /credit-investigations/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load credit review.' });
  }
});

router.get('/customers/:id/credit-review-context', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) {
      return res.status(400).json({ success: false, message: 'Invalid customer id.' });
    }
    const access = await assertSalesCustomerAccess(pool, user, customerId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }
    const evidence = await buildCustomerCreditEvidence(pool, customerId);
    return res.status(200).json({ success: true, data: evidence });
  } catch (err) {
    console.error('[Sales] GET /customers/:id/credit-review-context error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load credit review context.' });
  }
});

router.get('/audit-logs', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser.id;
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const result = await pool.query(
      `SELECT log_id AS audit_id, action, status_details AS detail, ip_address, created_at
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Sales] GET /audit-logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load audit log.' });
  }
});

router.get('/invoices', salesStaffOrOperatingManager, async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const userId = user.id;
  const { status, page = 1, limit = 50, start_date: startDate, end_date: endDate, branch_id: branchId } = req.query;
  const pageNumber = positiveInteger(page) || 1;
  const pageSize = Math.min(positiveInteger(limit) || 50, 100);
  const conditions = [];
  const params = [];
  let pIdx = 1;

  if (user.roleSlug === 'operating_manager') {
    conditions.push('1=1');
    if (branchId) {
      conditions.push(`si.branch_id = $${pIdx++}`);
      params.push(Number(branchId));
    }
  } else if (user.roleSlug === 'branch_manager') {
    conditions.push(`si.branch_id = $${pIdx++}`);
    params.push(user.branchId);
  } else {
    conditions.push(`si.sales_agent_id = $${pIdx++}`);
    params.push(userId);
  }

  if (typeof status === 'string' && status.trim() && status !== 'All') {
    conditions.push(`si.status = $${pIdx++}`);
    params.push(status.trim());
  }
  if (isValidDate(startDate)) {
    conditions.push(`si.invoices_date >= $${pIdx++}`);
    params.push(startDate);
  }
  if (isValidDate(endDate)) {
    conditions.push(`si.invoices_date <= $${pIdx++}`);
    params.push(endDate);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (pageNumber - 1) * pageSize;
  const countParams = [...params];

  try {
    const result = await pool.query(
      `SELECT
         si.sales_invoices_id,
         si.invoice_number,
         si.customer_id,
         c.first_name,
         c.middle_name,
         c.last_name,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
         si.sales_agent_id,
         agent.full_name AS sales_agent_name,
         si.branch_id,
         b.name AS branch_name,
         si.total_amount,
         si.status,
         si.invoices_date::text AS invoices_date,
         si.due_date::text AS due_date,
         si.notes,
         si.pay_type,
         si.down_payment,
         si.term_months,
         si.monthly_amount,
         si.first_due_date::text AS first_due_date,
         pm.method_name AS payment_method,
         ARRAY(
           SELECT DISTINCT p.name
           FROM sales_invoice_items sii
           JOIN products p ON p.id = sii.product_id
           WHERE sii.invoices_id = si.sales_invoices_id
           ORDER BY p.name
         ) AS product_names,
         si.created_at,
         si.updated_at
       FROM sales_invoices si
       LEFT JOIN customers c ON c.customer_id = si.customer_id
       LEFT JOIN users agent ON agent.id = si.sales_agent_id
       LEFT JOIN branches b ON b.id = si.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = si.payment_method_id
       ${where}
       ORDER BY si.invoices_date DESC, si.sales_invoices_id DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, pageSize, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sales_invoices si ${where}`,
      countParams
    );
    const total = Number(countResult.rows[0].count);

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[Sales] GET /invoices error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message,
    });
  }
});

router.get('/invoices/:invoiceId/items', salesStaffOrOperatingManager, async (req, res) => {
  const user = { ...req.currentUser, pool: req.app.locals.pool };

  try {
    const invoice = await getInvoice(req.params.invoiceId, user);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
      });
    }

    const items = await getInvoiceItems(invoice.sales_invoices_id, user);

    return res.status(200).json({
      success: true,
      invoice,
      data: items,
      count: items.length,
    });
  } catch (error) {
    console.error('[Sales] GET /invoices/:invoiceId/items error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice items',
    });
  }
});

router.get('/invoices/:invoiceId', salesStaffOrOperatingManager, async (req, res) => {
  const user = { ...req.currentUser, pool: req.app.locals.pool };

  try {
    const invoice = await getInvoice(req.params.invoiceId, user);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error('[Sales] GET /invoices/:invoiceId error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
    });
  }
});

router.use(salesStaffOnly);

router.get('/payment-methods', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      `SELECT payment_method_id, method_name
       FROM payment_methods
       WHERE status = 'Active'
       ORDER BY method_name`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('[Sales] GET /payment-methods error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods',
    });
  }
});

router.post('/invoices', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const customerId = positiveInteger(req.body.customer_id);
  const invoicesDate = req.body.invoices_date;
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  if (!customerId || !isValidDate(invoicesDate)) {
    return res.status(400).json({
      success: false,
      message: 'Valid customer_id and invoices_date are required.',
    });
  }

  if (!items.length) {
    return res.status(400).json({
      success: false,
      message: 'At least one line item is required.',
    });
  }

  if (user.branchId === null) {
    return res.status(400).json({
      success: false,
      message: 'Sales invoices must be logged by a branch-assigned sales agent.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const applied = await applySalesInvoice(client, user, req.body);
    const invoiceNumber = applied.invoiceNumber;
    const stockAlerts = applied.stockAlerts;
    await client.query('COMMIT');
    await publishStockAlerts(pool, stockAlerts);
    await notifyOverdueAccounts(pool);
    await notifyInvoicePendingReview(pool, {
      branchId: user.branchId,
      invoiceNumber,
      customerId,
      agentId: user.id,
    });

    await writeAuditFromReq(pool, req, {
      module: 'Sales',
      activity: 'Create Sales Invoice',
      action: 'Create Sales Invoice',
      description: `Logged sales invoice ${invoiceNumber}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `invoice:${applied.invoiceId}`,
    });

    try {
      const invoice = await getInvoice(invoiceNumber, { ...user, pool });
      return res.status(201).json({
        success: true,
        data: invoice,
        message: 'Sale logged successfully.',
      });
    } catch (lookupError) {
      console.error('[Sales] invoice lookup after commit:', lookupError.message);
      return res.status(201).json({
        success: true,
        data: { invoice_number: invoiceNumber, sales_invoices_id: applied.invoiceId },
        message: 'Sale logged successfully.',
      });
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already finished */ }
    if (error.status || error.conflict) {
      return res.status(error.status || 409).json({
        success: false,
        message: error.message,
        conflict: Boolean(error.conflict),
      });
    }
    console.error('[Sales] POST /invoices error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to log sale',
    });
  } finally {
    client.release();
  }
});

router.get('/visits', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const { status, scheduled_date: scheduledDate, start_date: startDate, end_date: endDate } = req.query;
  const conditions = ['fv.user_id = $1'];
  const params = [userId];
  let pIdx = 2;

  if (typeof status === 'string' && status.trim() && status !== 'All') {
    conditions.push(`fv.status = $${pIdx++}`);
    params.push(status.trim());
  }
  if (isValidDate(scheduledDate)) {
    conditions.push(`fv.scheduled_date = $${pIdx++}`);
    params.push(scheduledDate);
  }
  if (isValidDate(startDate)) {
    conditions.push(`fv.scheduled_date >= $${pIdx++}`);
    params.push(startDate);
  }
  if (isValidDate(endDate)) {
    conditions.push(`fv.scheduled_date <= $${pIdx++}`);
    params.push(endDate);
  }

  try {
    const result = await pool.query(
      `SELECT
         fv.visit_id,
         fv.customer_id,
         c.first_name,
         c.middle_name,
         c.last_name,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
         c.address,
         c.latitude,
         c.longitude,
         c.contact_phone,
         c.contact_person_fname,
         c.contact_person_mname,
         c.contact_person_lname,
         c.contact_person_phone,
         c.status AS customer_status,
         fv.user_id,
         u.first_name AS agent_first_name,
         u.last_name AS agent_last_name,
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Sales Agent') AS agent_name,
         fv.visit_type,
         fv.scheduled_date::text AS scheduled_date,
         fv.status,
         fv.created_at,
         fv.updated_at
       FROM field_visits fv
       JOIN customers c ON c.customer_id = fv.customer_id
       JOIN users u ON u.id = fv.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY fv.scheduled_date ASC, fv.visit_id ASC`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[Sales] GET /visits error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch field visits',
      error: error.message,
    });
  }
});

router.get('/visits/:id', async (req, res) => {
  const visitId = positiveInteger(req.params.id);
  const userId = req.currentUser.id;

  try {
    const visit = await getVisit(req.app.locals.pool, visitId, userId);

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'Field visit not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: visit,
    });
  } catch (error) {
    console.error('[Sales] GET /visits/:id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch field visit',
    });
  }
});

router.post('/visits', async (req, res) => {
  const pool = req.app.locals.pool;
  const customerId = positiveInteger(req.body.customer_id);
  const visitType = typeof req.body.visit_type === 'string' ? req.body.visit_type.trim() : '';
  const scheduledDate = req.body.scheduled_date;
  const status = req.body.status === undefined ? 'Pending' : req.body.status;

  if (!customerId || !VISIT_TYPES.has(visitType) || !isValidDate(scheduledDate)) {
    return res.status(400).json({
      success: false,
      message: 'Valid customer_id, visit_type (Collection or Sales), and scheduled_date are required.',
    });
  }

  if (!VISIT_STATUSES.has(status)) {
    return res.status(400).json({
      success: false,
      message: 'status must be Pending or Completed.',
    });
  }

  try {
    const customerResult = await pool.query(
      `SELECT customer_id, branch_id
       FROM customers
       WHERE customer_id = $1`,
      [customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    if (req.currentUser.branchId !== null
      && customerResult.rows[0].branch_id !== req.currentUser.branchId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: customer is not in your assigned branch.',
      });
    }

    const result = await pool.query(
      `INSERT INTO field_visits
         (customer_id, user_id, visit_type, scheduled_date, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING visit_id`,
      [customerId, req.currentUser.id, visitType, scheduledDate, status]
    );

    if (status === 'Completed' && visitType === 'Sales' && req.currentUser.roleSlug === 'sales_staff') {
      await assignSalesAgentToCustomer(pool, customerId, req.currentUser.id);
    }

    if (status === 'Pending') {
      const nameRow = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Customer') AS customer_name
         FROM customers WHERE customer_id = $1`,
        [customerId]
      );
      await notifyScheduleAssigned(pool, {
        userId: req.currentUser.id,
        scheduledDate,
        visitType,
        customerNames: [nameRow.rows[0]?.customer_name || 'Customer'],
      });
    }

    const visit = await getVisit.call({ pool }, result.rows[0].visit_id, req.currentUser.id);

    await writeAuditFromReq(pool, req, {
      module: 'Sales',
      activity: 'Create Field Visit',
      action: 'Create Field Visit',
      description: `Created ${visitType} visit for customer #${customerId} on ${scheduledDate}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `visit:${result.rows[0].visit_id}`,
    });

    return res.status(201).json({
      success: true,
      data: visit,
      message: 'Field visit created successfully',
    });
  } catch (error) {
    console.error('[Sales] POST /visits error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create field visit',
    });
  }
});

router.put('/visits/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const visitId = positiveInteger(req.params.id);
  const { status, scheduled_date: scheduledDate, visit_type: visitType } = req.body;
  const updates = [];
  const params = [];
  let paramIndex = 1;

  const addUpdate = (column, value) => {
    updates.push(`${column} = $${paramIndex}`);
    params.push(value);
    paramIndex += 1;
  };

  if (!visitId) {
    return res.status(400).json({
      success: false,
      message: 'A valid visit id is required.',
    });
  }

  if (status !== undefined) {
    if (!VISIT_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be Pending or Completed.',
      });
    }
    addUpdate('status', status);
  }

  if (scheduledDate !== undefined) {
    if (!isValidDate(scheduledDate)) {
      return res.status(400).json({
        success: false,
        message: 'scheduled_date must be a valid date in YYYY-MM-DD format.',
      });
    }
    addUpdate('scheduled_date', scheduledDate);
  }

  if (visitType !== undefined) {
    const normalizedVisitType = String(visitType).trim();
    if (!VISIT_TYPES.has(normalizedVisitType)) {
      return res.status(400).json({
        success: false,
        message: 'visit_type must be Collection or Sales.',
      });
    }
    addUpdate('visit_type', normalizedVisitType);
  }

  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No supported fields were provided.',
    });
  }

  updates.push('updated_at = NOW()');
  params.push(visitId, req.currentUser.id);

  try {
    const priorVisit = await pool.query(
      `SELECT customer_id, visit_type, status
       FROM field_visits
       WHERE visit_id = $1 AND user_id = $2`,
      [visitId, req.currentUser.id]
    );
    if (!priorVisit.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Field visit not found',
      });
    }
    const prior = priorVisit.rows[0];

    await pool.query(
      `UPDATE field_visits
       SET ${updates.join(', ')}
       WHERE visit_id = $${paramIndex}
         AND user_id = $${paramIndex + 1}`,
      params
    );

    const visit = await getVisit(pool, visitId, req.currentUser.id);

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'Field visit not found',
      });
    }

    const effectiveStatus = status !== undefined ? status : visit.status;
    const effectiveType = visitType !== undefined ? String(visitType).trim() : (visit.visit_type || prior.visit_type);
    if (effectiveStatus === 'Completed' && effectiveType === 'Sales' && req.currentUser.roleSlug === 'sales_staff') {
      await assignSalesAgentToCustomer(pool, visit.customer_id, req.currentUser.id);
    }

    await writeAuditFromReq(pool, req, {
      module: 'Sales',
      activity: 'Edit Field Visit',
      action: 'Edit Field Visit',
      description: `Updated field visit #${visitId} (status: ${effectiveStatus}).`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `visit:${visitId}`,
    });

    return res.status(200).json({
      success: true,
      data: visit,
      message: 'Field visit updated successfully',
    });
  } catch (error) {
    console.error('[Sales] PUT /visits/:id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update field visit',
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Collection Payments — scoped to the logged-in collector
// GET /api/sales/payments
// ──────────────────────────────────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         cp.collectionpayment_id,
         cp.customer_id,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
         cp.collector_id,
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS collector_name,
         cp.branch_id,
         b.name AS branch_name,
         cp.payment_method_id,
         COALESCE(pm.method_name, '—') AS payment_method,
         cp.receipt_number,
         cp.amount,
         cp.payment_date,
         cp.payment_time,
         cp.status,
         cp.notes,
         cp.created_at,
         cp.updated_at
       FROM collection_payment cp
       JOIN customers c ON c.customer_id = cp.customer_id
       JOIN users u ON u.id = cp.collector_id
       JOIN branches b ON b.id = cp.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       WHERE cp.collector_id = $1
       ORDER BY cp.payment_date DESC, cp.payment_time DESC, cp.collectionpayment_id DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[Sales] GET /payments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch collection payments',
    });
  }
});

router.get('/purchase-requests', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;

  try {
    const { whereSql, params } = purchaseRequestListFilter(user);

    const result = await pool.query(
      `SELECT pr.request_id, pr.status, pr.notes, pr.agent_reply, pr.created_at, pr.updated_at,
              pr.sales_invoices_id,
              c.customer_id, c.customer_code,
              c.first_name || ' ' || c.last_name AS customer_name
       FROM purchase_requests pr
       JOIN customers c ON c.customer_id = pr.customer_id
       WHERE ${whereSql}
       ORDER BY pr.created_at DESC
       LIMIT 100`,
      params
    );

    const ids = result.rows.map((r) => r.request_id);
    let itemsByRequest = {};
    if (ids.length) {
      const items = await pool.query(
        `SELECT pri.request_id, pri.item_id, pri.product_id, pri.quantity, pri.notes,
                p.name AS product_name, p.sku, p.unit_price, p.image_url
         FROM purchase_request_items pri
         JOIN products p ON p.id = pri.product_id
         WHERE pri.request_id = ANY($1::int[])`,
        [ids]
      );
      itemsByRequest = items.rows.reduce((acc, row) => {
        if (!acc[row.request_id]) acc[row.request_id] = [];
        acc[row.request_id].push({
          ...row,
          unit_price: Number(row.unit_price) || 0,
          quantity: Number(row.quantity),
        });
        return acc;
      }, {});
    }

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => {
        const items = itemsByRequest[row.request_id] || [];
        const estimated_total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
        return { ...row, items, estimated_total };
      }),
    });
  } catch (err) {
    console.error('[Sales] GET /purchase-requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase requests.' });
  }
});

router.get('/purchase-requests/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = Number(req.params.id);
  try {
    const data = await getPurchaseRequestDetail(pool, req.currentUser, requestId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Purchase request not found.' });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[Sales] GET /purchase-requests/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase request.' });
  }
});

router.put('/purchase-requests/:id/items', async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = Number(req.params.id);
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items?.length) {
    return res.status(400).json({ success: false, message: 'Keep at least one product line.' });
  }
  const normalized = items.map((item) => ({
    product_id: Number(item.product_id),
    quantity: Number(item.quantity),
  }));
  if (normalized.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0
    || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    return res.status(400).json({ success: false, message: 'Each line needs an active product and a whole quantity.' });
  }
  if (new Set(normalized.map((item) => item.product_id)).size !== normalized.length) {
    return res.status(400).json({ success: false, message: 'Each product can appear once. Change the quantity instead.' });
  }

  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT pr.request_id, pr.status, pr.sales_agent_id, pr.customer_id, c.assigned_sales_agent_id
       FROM purchase_requests pr
       JOIN customers c ON c.customer_id = pr.customer_id
       WHERE pr.request_id = $1`,
      [requestId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Purchase request not found.' });
    }
    const row = existing.rows[0];
    if (!userCanManagePurchaseRequest(req.currentUser, row)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this request.' });
    }
    if (!['Pending', 'In Review', 'Confirmed'].includes(row.status)) {
      return res.status(400).json({ success: false, message: 'Quantities can be adjusted before the request is invoiced, rejected, or cancelled.' });
    }
    const current = await client.query(
      `SELECT product_id FROM purchase_request_items WHERE request_id = $1 ORDER BY product_id`,
      [requestId]
    );
    const currentIds = current.rows.map((item) => Number(item.product_id));
    const nextIds = normalized.map((item) => item.product_id).sort((a, b) => a - b);
    if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
      return res.status(400).json({
        success: false,
        message: 'The customer chose these products. Adjust a quantity, or reject the request.',
      });
    }

    await client.query('BEGIN');
    for (const item of normalized) {
      await client.query(
        `UPDATE purchase_request_items SET quantity = $1 WHERE request_id = $2 AND product_id = $3`,
        [item.quantity, requestId, item.product_id]
      );
    }
    await client.query(
      `UPDATE purchase_requests SET updated_at = CURRENT_TIMESTAMP WHERE request_id = $1`,
      [requestId]
    );
    await client.query('COMMIT');

    const data = await getPurchaseRequestDetail(pool, req.currentUser, requestId);
    return res.status(200).json({
      success: true,
      message: 'Quantities updated. The customer’s products are unchanged.',
      data,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already finished */ }
    console.error('[Sales] PUT /purchase-requests/:id/items error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update request lines.' });
  } finally {
    client.release();
  }
});

router.patch('/purchase-requests/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = Number(req.params.id);
  const { status, reply, reopen } = req.body || {};
  const allowed = new Set(['In Review', 'Confirmed', 'Rejected', 'Cancelled']);
  if (!allowed.has(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  const replyText = typeof reply === 'string' ? reply.trim() : '';
  if ((status === 'Rejected' || status === 'Cancelled') && !replyText) {
    return res.status(400).json({ success: false, message: 'A reason is required. The customer will see it.' });
  }
  if (replyText.length > 1000) {
    return res.status(400).json({ success: false, message: 'Keep the reply under 1000 characters.' });
  }

  try {
    const existing = await pool.query(
      `SELECT pr.request_id, pr.status, pr.agent_reply, pr.sales_agent_id, pr.customer_id,
              pr.branch_id, c.assigned_sales_agent_id
       FROM purchase_requests pr
       JOIN customers c ON c.customer_id = pr.customer_id
       WHERE pr.request_id = $1`,
      [requestId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Purchase request not found.' });
    }
    const row = existing.rows[0];
    if (!userCanManagePurchaseRequest(req.currentUser, row)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this request.' });
    }
    const moveError = purchaseRequestStatusMove(row.status, status);
    if (moveError) {
      return res.status(400).json({ success: false, message: moveError });
    }
    if (status === 'Confirmed') {
      const block = await confirmBlockReason(pool, requestId, row.branch_id);
      if (block) return res.status(400).json({ success: false, message: block });
    }

    const nextReply = replyText || (status === 'In Review' ? row.agent_reply : null);
    const updated = await pool.query(
      `UPDATE purchase_requests
       SET status = $1,
           agent_reply = $2,
           reviewed_by = $3,
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $4
       RETURNING request_id, status, agent_reply, reviewed_at`,
      [status, nextReply, req.currentUser.id, requestId]
    );

    await notifyPurchaseRequestCustomer(pool, {
      customerId: row.customer_id,
      requestId,
      status,
      reply: nextReply,
      reopened: Boolean(reopen) && status === 'In Review',
    });

    await writeAuditFromReq(pool, req, {
      module: 'Sales',
      activity: 'Update Purchase Request',
      action: 'Update Purchase Request',
      description: `Updated purchase request #${requestId} to status ${status}.`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `purchase_request:${requestId}`,
    });

    return res.status(200).json({
      success: true,
      message: status === 'Rejected' || status === 'Cancelled'
        ? `Purchase request ${status.toLowerCase()}. The customer was notified.`
        : `Purchase request marked as ${status}. The customer was notified.`,
      data: {
        ...updated.rows[0],
        customer_id: row.customer_id,
      },
    });
  } catch (err) {
    console.error('[Sales] PATCH /purchase-requests/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update purchase request.' });
  }
});

const SALES_FAR_SELECT = `
  far.report_id,
  far.visit_id,
  far.assignment_id,
  far.customer_id,
  far.activity_type,
  far.remarks,
  far.sync_status,
  far.photo,
  far.created_at,
  saa.area_name,
  saa.work_date::text AS work_date,
  saa.status AS assignment_status,
  fv.scheduled_date,
  fv.visit_type,
  fv.status AS visit_status,
  COALESCE(
    NULLIF(CONCAT_WS(' ', linked.first_name, linked.last_name), ''),
    NULLIF(CONCAT_WS(' ', visit_c.first_name, visit_c.last_name), ''),
    NULL
  ) AS customer_name
`;

const SALES_FAR_FROM = `
  FROM field_activity_reports far
  LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far.assignment_id
  LEFT JOIN field_visits fv ON fv.visit_id = far.visit_id
  LEFT JOIN customers visit_c ON visit_c.customer_id = fv.customer_id
  LEFT JOIN customers linked ON linked.customer_id = far.customer_id
`;

router.get('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT ${SALES_FAR_SELECT}
       ${SALES_FAR_FROM}
       WHERE far.user_id = $1
       ORDER BY far.created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Sales] GET /field-reports error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch field activity reports.' });
  }
});

router.get('/field-reports/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const reportId = positiveInteger(req.params.id);
  if (!reportId) {
    return res.status(400).json({ success: false, message: 'Invalid report id.' });
  }

  try {
    const result = await pool.query(
      `SELECT ${SALES_FAR_SELECT}
       ${SALES_FAR_FROM}
       WHERE far.user_id = $1 AND far.report_id = $2`,
      [userId, reportId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Field activity report not found.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[Sales] GET /field-reports/:id error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch field activity report.' });
  }
});

router.post('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const {
    assignment_id: assignmentIdRaw,
    visit_id: visitIdRaw,
    customer_id: customerIdRaw,
    activity_type,
    remarks,
    photo,
  } = req.body;
  const photoValue = typeof photo === 'string' ? photo.trim() : '';
  const assignmentId = positiveInteger(assignmentIdRaw);
  const visitId = positiveInteger(visitIdRaw);
  const customerId = positiveInteger(customerIdRaw);

  if (!activity_type || !String(remarks || '').trim()) {
    return res.status(400).json({
      success: false,
      message: 'activity_type and remarks are required.',
    });
  }
  if (!assignmentId && !visitId) {
    return res.status(400).json({
      success: false,
      message: 'assignment_id is required for sales field reports.',
    });
  }
  if (!photoValue || !photoValue.startsWith('data:image/')) {
    return res.status(400).json({
      success: false,
      message: 'photo must be a valid image upload.',
    });
  }
  if (photoValue.length > 900_000) {
    return res.status(400).json({
      success: false,
      message: 'photo is too large. Use a smaller image.',
    });
  }

  try {
    if (assignmentId) {
      const assignmentCheck = await pool.query(
        `SELECT assignment_id FROM sales_area_assignments
         WHERE assignment_id = $1 AND sales_agent_id = $2`,
        [assignmentId, userId]
      );
      if (!assignmentCheck.rows.length) {
        return res.status(404).json({ success: false, message: 'Area assignment not found for this sales agent.' });
      }
    }

    if (visitId) {
      const visitCheck = await pool.query(
        `SELECT visit_id FROM field_visits WHERE visit_id = $1 AND user_id = $2`,
        [visitId, userId]
      );
      if (!visitCheck.rows.length) {
        return res.status(404).json({ success: false, message: 'Visit not found for this sales agent.' });
      }
    }

    if (customerId) {
      const customerCheck = await pool.query(
        `SELECT customer_id FROM customers
         WHERE customer_id = $1
           AND branch_id = $2`,
        [customerId, req.currentUser.branchId]
      );
      if (!customerCheck.rows.length) {
        return res.status(404).json({ success: false, message: 'Customer not found in your branch.' });
      }
    }

    const result = await pool.query(
      `INSERT INTO field_activity_reports
         (visit_id, assignment_id, customer_id, user_id, activity_type, remarks, photo, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Synced')
       RETURNING report_id, visit_id, assignment_id, customer_id, activity_type, remarks, photo, sync_status, created_at`,
      [
        visitId,
        assignmentId,
        customerId,
        userId,
        String(activity_type).trim(),
        String(remarks).trim(),
        photoValue,
      ]
    );

    await writeAuditFromReq(pool, req, {
      module: 'Sales',
      activity: 'Submit Field Report',
      action: 'Submit Field Report',
      description: `Submitted field activity report (${String(activity_type).trim()}) for visit #${visit_id}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `field_report:${result.rows[0].report_id}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Field activity report submitted.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[Sales] POST /field-reports error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit field activity report.' });
  }
});

// ── Area assignments (canvass schedule — not customer field_visits) ───────────

router.get('/area-assignments', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { scope, today, dateSql } = resolveScopeDates(req.query.scope);
    const params = [user.id, today];
    const result = await pool.query(
      `SELECT ${AREA_ASSIGNMENT_SELECT}
       ${AREA_ASSIGNMENT_FROM}
       WHERE saa.sales_agent_id = $1
         AND ${dateSql}
       ORDER BY
         CASE saa.status
           WHEN 'In Progress' THEN 0
           WHEN 'Assigned' THEN 1
           ELSE 2
         END,
         saa.work_date ASC,
         saa.assignment_id ASC`,
      params
    );
    const productsByAssignment = await loadAssignmentProducts(
      pool,
      result.rows.map((row) => row.assignment_id)
    );
    const data = result.rows.map((row) => withProducts(row, productsByAssignment));
    let summary = null;
    if (scope === 'today') {
      summary = await fetchAssignmentOutcomeStats(pool, user.id, today);
      summary.areas_assigned = data.length;
      summary.areas_done = data.filter((row) => row.status === 'Done').length;
      summary.areas_in_progress = data.filter((row) => row.status === 'In Progress').length;
    }
    return res.status(200).json({
      success: true,
      data,
      count: data.length,
      meta: { scope, today, summary },
    });
  } catch (error) {
    console.error('[Sales] GET /area-assignments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load area assignments.' });
  }
});

router.get('/area-assignments/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const assignmentId = positiveInteger(req.params.id);
    if (!assignmentId) {
      return res.status(400).json({ success: false, message: 'Invalid assignment id.' });
    }
    const result = await pool.query(
      `SELECT ${AREA_ASSIGNMENT_SELECT}
       ${AREA_ASSIGNMENT_FROM}
       WHERE saa.assignment_id = $1 AND saa.sales_agent_id = $2`,
      [assignmentId, user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Area assignment not found.' });
    }
    const productsByAssignment = await loadAssignmentProducts(pool, [assignmentId]);
    const row = withProducts(result.rows[0], productsByAssignment);
    const outcomes = await fetchAssignmentOutcomeStats(pool, user.id, row.work_date);
    return res.status(200).json({
      success: true,
      data: { ...row, outcomes },
    });
  } catch (error) {
    console.error('[Sales] GET /area-assignments/:id error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load area assignment.' });
  }
});

router.patch('/area-assignments/:id/status', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const assignmentId = positiveInteger(req.params.id);
    const nextStatus = String(req.body?.status || '').trim();
    if (!assignmentId) {
      return res.status(400).json({ success: false, message: 'Invalid assignment id.' });
    }
    if (!AREA_ASSIGNMENT_STATUSES.has(nextStatus) || nextStatus === 'Assigned') {
      return res.status(400).json({
        success: false,
        message: 'Status must be In Progress or Done.',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT assignment_id, status, started_at, completed_at
         FROM sales_area_assignments
         WHERE assignment_id = $1 AND sales_agent_id = $2
         FOR UPDATE`,
        [assignmentId, user.id]
      );
      if (!existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Area assignment not found.' });
      }

      const current = existing.rows[0];
      if (current.status === 'Done' && nextStatus !== 'Done') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Completed assignments cannot be reopened by the sales agent.' });
      }
      if (nextStatus === 'In Progress' && current.status === 'Done') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Assignment is already done.' });
      }

      const startedAt = (nextStatus === 'In Progress' || nextStatus === 'Done')
        ? (current.started_at || new Date())
        : current.started_at;
      const completedAt = nextStatus === 'Done'
        ? (current.completed_at || new Date())
        : null;

      const updated = await client.query(
        `UPDATE sales_area_assignments
         SET status = $1,
             started_at = $2,
             completed_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE assignment_id = $4 AND sales_agent_id = $5
         RETURNING assignment_id`,
        [nextStatus, startedAt, completedAt, assignmentId, user.id]
      );
      await client.query('COMMIT');

      const detail = await pool.query(
        `SELECT ${AREA_ASSIGNMENT_SELECT}
         ${AREA_ASSIGNMENT_FROM}
         WHERE saa.assignment_id = $1`,
        [updated.rows[0].assignment_id]
      );
      const productsByAssignment = await loadAssignmentProducts(pool, [assignmentId]);
      return res.status(200).json({
        success: true,
        message: nextStatus === 'Done' ? 'Area marked as done.' : 'Area started.',
        data: withProducts(detail.rows[0], productsByAssignment),
      });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Sales] PATCH /area-assignments/:id/status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update area assignment.' });
  }
});

export default router;
