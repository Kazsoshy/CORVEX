import express from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  purchaseRequestListFilter,
  purchaseRequestAccessSql,
  userCanManagePurchaseRequest,
  assignSalesAgentToCustomer,
} from '../lib/purchaseRequests.js';
import {
  CREDIT_INVESTIGATION_FROM,
  CREDIT_INVESTIGATION_SELECT,
} from '../lib/creditInvestigationQueries.js';
import { notifyCreditInvestigationSubmitted } from '../lib/creditInvestigationNotifications.js';

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
  } else if (user.branchId !== null) {
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
const salesStaffOrOperatingManager = requireRole(['sales_staff', 'operating_manager']);

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
      visitsToday,
      salesPeriods,
      recentSales,
      topProducts,
      topCustomers,
      lowStock,
      ciCounts,
    ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE fv.status = 'Pending')::int AS pending,
           COUNT(*) FILTER (WHERE fv.status = 'Completed')::int AS completed
         FROM field_visits fv
         WHERE fv.user_id = $1 AND fv.visit_type = 'Sales' AND fv.scheduled_date = $2::date`,
        [userId, today]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(total_amount) FILTER (WHERE invoices_date = $2::date), 0) AS daily,
           COALESCE(SUM(total_amount) FILTER (WHERE invoices_date >= $2::date - 6), 0) AS weekly,
           COALESCE(SUM(total_amount) FILTER (WHERE invoices_date >= date_trunc('month', $2::date)::date), 0) AS monthly,
           COUNT(*) FILTER (WHERE invoices_date = $2::date)::int AS sales_logged_today
         FROM sales_invoices
         WHERE sales_agent_id = $1`,
        [userId, today]
      ),
      pool.query(
        `SELECT si.sales_invoices_id, si.invoice_number, si.total_amount, si.invoices_date::text AS invoices_date,
                c.first_name, c.last_name,
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
            `SELECT p.id, p.name, p.sku, bi.available_stock AS stock, bi.stock_status AS status, b.name AS branch
             FROM branch_inventory bi
             JOIN products p ON p.id = bi.product_id
             JOIN branches b ON b.id = bi.branch_id
             WHERE bi.branch_id = $1 AND bi.available_stock <= bi.reorder_level
             ORDER BY bi.available_stock ASC
             LIMIT 10`,
            [branchId]
          )
        : Promise.resolve({ rows: [] }),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved,
           COUNT(*) FILTER (WHERE status IN ('Rejected', 'Revision Requested'))::int AS needs_action
         FROM credit_investigations
         WHERE submitted_by = $1`,
        [userId]
      ),
    ]);

    const vt = visitsToday.rows[0] || {};
    const totalVisits = Number(vt.total) || 0;
    const completedVisits = Number(vt.completed) || 0;
    const pendingVisits = Number(vt.pending) || 0;
    const sp = salesPeriods.rows[0] || {};
    const ciRow = ciCounts.rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          accountsToVisit: totalVisits,
          pendingVisits,
          completedVisits,
          salesLogged: Number(sp.sales_logged_today) || 0,
          visitProgress: totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0,
          creditInvestigationsPending: Number(ciRow.pending) || 0,
          creditInvestigationsTotal: Number(ciRow.total) || 0,
        },
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
          date: r.invoices_date,
        })),
        lowStockItems: lowStock.rows.map((r, idx) => ({
          id: r.id ?? idx,
          name: r.name,
          sku: r.sku,
          stock: r.stock,
          status: r.status,
          branch: r.branch,
        })),
      },
    });
  } catch (err) {
    console.error('[Sales] GET /dashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
});

router.post('/credit-investigations', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const customerId = Number(req.body.customer_id);
    const {
      purpose,
      monthly_income: monthlyIncome,
      business_type: businessType,
      references_summary: referencesSummary,
      form_remarks: formRemarks,
    } = req.body;

    if (!Number.isFinite(customerId)) {
      return res.status(400).json({ success: false, message: 'Customer is required.' });
    }
    if (!String(purpose || '').trim()) {
      return res.status(400).json({ success: false, message: 'Purpose is required.' });
    }

    const access = await assertSalesCustomerAccess(pool, user, customerId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const customerMeta = await pool.query(
      `SELECT first_name, last_name FROM customers WHERE customer_id = $1`,
      [customerId]
    );
    const customerName = customerMeta.rows[0]
      ? `${customerMeta.rows[0].first_name} ${customerMeta.rows[0].last_name}`.trim()
      : 'Customer';

    const submitterMeta = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
      [user.id]
    );
    const submitterName = submitterMeta.rows[0]?.display_name || 'Sales agent';

    const result = await pool.query(
      `INSERT INTO credit_investigations (
         customer_id, branch_id, submitted_by, status, purpose, monthly_income,
         business_type, references_summary, form_remarks
       ) VALUES ($1, $2, $3, 'Pending', $4, $5, $6, $7, $8)
       RETURNING ci_id, status, created_at`,
      [
        customerId,
        access.row.branch_id,
        user.id,
        String(purpose).trim(),
        Number(monthlyIncome) || 0,
        businessType ? String(businessType).trim() : null,
        referencesSummary ? String(referencesSummary).trim() : null,
        formRemarks ? String(formRemarks).trim() : null,
      ]
    );

    const ciId = result.rows[0].ci_id;
    await notifyCreditInvestigationSubmitted(pool, {
      branchId: access.row.branch_id,
      ciId,
      customerName,
      submitterName,
    });

    return res.status(201).json({
      success: true,
      message: 'Credit investigation submitted for branch approval.',
      data: { ...result.rows[0], customer_id: customerId, customer_name: customerName },
    });
  } catch (err) {
    console.error('[Sales] POST /credit-investigations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit credit investigation.' });
  }
});

router.get('/credit-investigations', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { status } = req.query;
    const params = [user.id];
    let statusSql = '';
    if (status && status !== 'All') {
      statusSql = ' AND ci.status = $2';
      params.push(String(status));
    }

    const result = await pool.query(
      `SELECT ${CREDIT_INVESTIGATION_SELECT}
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ci.submitted_by = $1${statusSql}
       ORDER BY ci.created_at DESC
       LIMIT 200`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Sales] GET /credit-investigations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load your credit investigations.' });
  }
});

router.get('/credit-investigations/:id', salesStaffOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const ciId = Number(req.params.id);
    if (!Number.isFinite(ciId)) {
      return res.status(400).json({ success: false, message: 'Invalid CI id.' });
    }

    const result = await pool.query(
      `SELECT ${CREDIT_INVESTIGATION_SELECT}
       ${CREDIT_INVESTIGATION_FROM}
       WHERE ci.ci_id = $1 AND ci.submitted_by = $2`,
      [ciId, user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Credit investigation not found.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Sales] GET /credit-investigations/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load credit investigation.' });
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

async function generateInvoiceNumber(pool) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const result = await pool.query(
    `SELECT invoice_number
     FROM sales_invoices
     WHERE invoice_number LIKE $1
     ORDER BY sales_invoices_id DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (result.rows[0]?.invoice_number) {
    const suffix = result.rows[0].invoice_number.slice(prefix.length);
    const parsed = Number.parseInt(suffix, 10);
    if (Number.isFinite(parsed)) nextSeq = parsed + 1;
  }

  return `${prefix}${String(nextSeq).padStart(6, '0')}`;
}

router.post('/invoices', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const customerId = positiveInteger(req.body.customer_id);
  const paymentMethodId = positiveInteger(req.body.payment_method_id);
  const invoicesDate = req.body.invoices_date;
  const dueDate = req.body.due_date;
  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const purchaseRequestId = positiveInteger(req.body.purchase_request_id);

  if (!customerId || !paymentMethodId || !isValidDate(invoicesDate)) {
    return res.status(400).json({
      success: false,
      message: 'Valid customer_id, payment_method_id, and invoices_date are required.',
    });
  }

  if (dueDate !== undefined && dueDate !== null && dueDate !== '' && !isValidDate(dueDate)) {
    return res.status(400).json({
      success: false,
      message: 'due_date must be a valid YYYY-MM-DD date when provided.',
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

  const normalizedItems = [];
  for (const rawItem of items) {
    const productId = positiveInteger(rawItem.product_id);
    const quantity = positiveInteger(rawItem.quantity);
    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Each line item requires a valid product_id and quantity.',
      });
    }
    normalizedItems.push({
      productId,
      quantity,
      unitPrice: rawItem.unit_price !== undefined && rawItem.unit_price !== null
        ? Number(rawItem.unit_price)
        : null,
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [748392001]);

    const customerResult = await client.query(
      `SELECT customer_id, branch_id
       FROM customers
       WHERE customer_id = $1`,
      [customerId]
    );

    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (customerResult.rows[0].branch_id !== user.branchId) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Access denied: customer is not in your assigned branch.',
      });
    }

    const paymentResult = await client.query(
      `SELECT payment_method_id
       FROM payment_methods
       WHERE payment_method_id = $1 AND status = 'Active'`,
      [paymentMethodId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid payment method.' });
    }

    const lineItems = [];
    for (const item of normalizedItems) {
      const productResult = await client.query(
        `SELECT id, unit_price
         FROM products
         WHERE id = $1 AND status = 'Active'`,
        [item.productId]
      );

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId} was not found or is inactive.`,
        });
      }

      const unitPrice = Number(productResult.rows[0].unit_price);

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId} has an invalid unit price.`,
        });
      }

      const stockResult = await client.query(
        `UPDATE branch_inventory
         SET available_stock = available_stock - $1,
             quantity = CASE WHEN quantity IS NULL THEN NULL ELSE quantity - $1 END
         WHERE product_id = $2
           AND branch_id = $3
           AND available_stock >= $1
         RETURNING available_stock`,
        [item.quantity, item.productId, user.branchId]
      );
      if (stockResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Not enough stock for product ${item.productId} at your branch.`,
        });
      }

      lineItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
      });
    }

    const totalAmount = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const invoiceNumber = await generateInvoiceNumber(client);

    const invoiceInsert = await client.query(
      `INSERT INTO sales_invoices
         (invoice_number, customer_id, sales_agent_id, branch_id, total_amount,
          payment_method_id, status, invoices_date, due_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending Review', $7, $8, $9)
       RETURNING sales_invoices_id`,
      [
        invoiceNumber,
        customerId,
        user.id,
        user.branchId,
        totalAmount,
        paymentMethodId,
        invoicesDate,
        dueDate && isValidDate(dueDate) ? dueDate : null,
        notes || null,
      ]
    );

    const invoiceId = invoiceInsert.rows[0].sales_invoices_id;

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO sales_invoice_items
           (invoices_id, product_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, item.productId, item.quantity, item.unitPrice, item.lineTotal]
      );
    }

    if (purchaseRequestId) {
      const prCheck = await client.query(
        `SELECT pr.request_id, pr.customer_id, pr.status, pr.sales_invoices_id
         FROM purchase_requests pr
         WHERE pr.request_id = $1`,
        [purchaseRequestId]
      );
      if (!prCheck.rows.length || prCheck.rows[0].customer_id !== customerId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Invalid purchase request for this customer.' });
      }
      if (prCheck.rows[0].sales_invoices_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'This purchase request is already linked to an invoice.' });
      }
      await client.query(
        `UPDATE purchase_requests
         SET sales_invoices_id = $1, status = 'Invoiced', updated_at = CURRENT_TIMESTAMP
         WHERE request_id = $2`,
        [invoiceId, purchaseRequestId]
      );
    }

    await client.query('COMMIT');

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
        data: { invoice_number: invoiceNumber, sales_invoices_id: invoiceId },
        message: 'Sale logged successfully.',
      });
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already finished */ }
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

    const visit = await getVisit.call({ pool }, result.rows[0].visit_id, req.currentUser.id);

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
      `SELECT pr.request_id, pr.status, pr.notes, pr.created_at, pr.updated_at,
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
                p.name AS product_name, p.sku
         FROM purchase_request_items pri
         JOIN products p ON p.id = pri.product_id
         WHERE pri.request_id = ANY($1::int[])`,
        [ids]
      );
      itemsByRequest = items.rows.reduce((acc, row) => {
        if (!acc[row.request_id]) acc[row.request_id] = [];
        acc[row.request_id].push(row);
        return acc;
      }, {});
    }

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({ ...row, items: itemsByRequest[row.request_id] || [] })),
    });
  } catch (err) {
    console.error('[Sales] GET /purchase-requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase requests.' });
  }
});

router.get('/purchase-requests/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = Number(req.params.id);
  const user = req.currentUser;
  const access = purchaseRequestAccessSql(user, 2);

  try {
    const result = await pool.query(
      `SELECT pr.request_id, pr.status, pr.notes, pr.created_at, pr.updated_at, pr.sales_invoices_id,
              pr.branch_id, pr.sales_agent_id,
              c.customer_id, c.customer_code, c.assigned_sales_agent_id,
              c.first_name || ' ' || c.last_name AS customer_name
       FROM purchase_requests pr
       JOIN customers c ON c.customer_id = pr.customer_id
       WHERE pr.request_id = $1
         AND ${access.sql}`,
      [requestId, ...access.extraParams]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Purchase request not found.' });
    }

    const items = await pool.query(
      `SELECT pri.item_id, pri.product_id, pri.quantity, pri.notes,
              p.name AS product_name, p.sku, p.unit_price
       FROM purchase_request_items pri
       JOIN products p ON p.id = pri.product_id
       WHERE pri.request_id = $1`,
      [requestId]
    );

    return res.status(200).json({
      success: true,
      data: { ...result.rows[0], items: items.rows },
    });
  } catch (err) {
    console.error('[Sales] GET /purchase-requests/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase request.' });
  }
});

router.patch('/purchase-requests/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = Number(req.params.id);
  const { status } = req.body;
  const allowed = new Set(['In Review', 'Confirmed', 'Rejected']);
  if (!allowed.has(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  try {
    const existing = await pool.query(
      `SELECT pr.request_id, pr.sales_agent_id, pr.customer_id, pr.branch_id, c.assigned_sales_agent_id
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

    const updated = await pool.query(
      `UPDATE purchase_requests SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $2
       RETURNING request_id, status, updated_at`,
      [status, requestId]
    );

    const items = await pool.query(
      `SELECT pri.product_id, pri.quantity, pri.notes, p.name AS product_name
       FROM purchase_request_items pri
       JOIN products p ON p.id = pri.product_id
       WHERE pri.request_id = $1`,
      [requestId]
    );

    return res.status(200).json({
      success: true,
      message: `Purchase request marked as ${status}.`,
      data: {
        ...updated.rows[0],
        customer_id: row.customer_id,
        items: items.rows,
      },
    });
  } catch (err) {
    console.error('[Sales] PATCH /purchase-requests/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update purchase request.' });
  }
});

export default router;
