import express from 'express';
import { requireRole } from '../middleware/auth.js';

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
       c.last_name,
       COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
       si.sales_agent_id,
       agent.full_name AS sales_agent_name,
       si.branch_id,
       b.name AS branch_name,
       si.total_amount,
       si.status,
       si.invoices_date,
       si.due_date,
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
       c.last_name,
       COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
       c.address,
       c.latitude,
       c.longitude,
       c.contact_phone,
       c.contact_person_fname,
       c.contact_person_lname,
       c.contact_person_phone,
       c.status AS customer_status,
       fv.user_id,
       u.first_name AS agent_first_name,
       u.last_name AS agent_last_name,
       COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Sales Agent') AS agent_name,
       fv.visit_type,
       fv.scheduled_date,
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

router.use(requireRole(['sales_staff']));

router.get('/invoices', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const { status, page = 1, limit = 50, start_date: startDate, end_date: endDate } = req.query;
  const pageNumber = positiveInteger(page) || 1;
  const pageSize = Math.min(positiveInteger(limit) || 50, 100);
  const conditions = ['si.sales_agent_id = $1'];
  const params = [userId];
  let pIdx = 2;

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

  try {
    const result = await pool.query(
      `SELECT
         si.sales_invoices_id,
         si.invoice_number,
         si.customer_id,
         c.first_name,
         c.last_name,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
         si.sales_agent_id,
         agent.full_name AS sales_agent_name,
         si.branch_id,
         b.name AS branch_name,
         si.total_amount,
         si.status,
         si.invoices_date,
         si.due_date,
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
      params
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

router.get('/invoices/:invoiceId/items', async (req, res) => {
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
      error: error.message,
    });
  }
});

router.get('/invoices/:invoiceId', async (req, res) => {
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
      error: error.message,
    });
  }
});

router.get('/visits', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         fv.visit_id,
         fv.customer_id,
         c.first_name,
         c.last_name,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
         c.address,
         c.latitude,
         c.longitude,
         c.contact_phone,
         c.contact_person_fname,
         c.contact_person_lname,
         c.contact_person_phone,
         c.status AS customer_status,
         fv.user_id,
         u.first_name AS agent_first_name,
         u.last_name AS agent_last_name,
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Sales Agent') AS agent_name,
         fv.visit_type,
         fv.scheduled_date,
         fv.status,
         fv.created_at,
         fv.updated_at
       FROM field_visits fv
       JOIN customers c ON c.customer_id = fv.customer_id
       JOIN users u ON u.id = fv.user_id
       WHERE fv.user_id = $1
       ORDER BY fv.scheduled_date ASC, fv.visit_id ASC`,
      [userId]
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
      error: error.message,
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
      error: error.message,
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
    await pool.query(
      `UPDATE field_visits
       SET ${updates.join(', ')}
       WHERE visit_id = $${paramIndex}
         AND user_id = $${paramIndex + 1}`,
      params
    );

    const visit = await getVisit.call({ pool }, visitId, req.currentUser.id);

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'Field visit not found',
      });
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
      error: error.message,
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
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
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
      error: error.message,
    });
  }
});

export default router;
