import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { resolveSalesAgentIdForCustomer } from '../lib/purchaseRequests.js';

const router = express.Router();

router.use(requireRole(['customer']));

async function getLinkedCustomer(pool, userId) {
  const result = await pool.query(
    `SELECT c.customer_id, c.customer_code, c.branch_id, c.first_name, c.middle_name, c.last_name,
            c.address, c.contact_phone, c.portal_email, c.portal_status, c.status,
            b.name AS branch_name,
            COALESCE(ca.outstanding_balance, 0) AS outstanding_balance,
            COALESCE(ca.purchase_volume, 0) AS purchase_volume,
            ca.last_collection_date,
            ca.last_sales_visit
     FROM customers c
     LEFT JOIN branches b ON b.id = c.branch_id
     LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
     WHERE c.user_id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

router.get('/me', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'No customer record is linked to this account.' });
    }
    return res.status(200).json({ success: true, data: customer });
  } catch (err) {
    console.error('[CustomerPortal] GET /me error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load account.' });
  }
});

router.get('/products', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const result = await pool.query(
      `SELECT p.id AS product_id, p.name AS product_name, p.sku, p.unit_price,
              COALESCE(pc.category_name, 'Uncategorized') AS category_name,
              COALESCE(bi.available_stock, 0) AS available_stock
       FROM products p
       LEFT JOIN product_categories pc ON pc.category_id = p.category_id
       LEFT JOIN branch_inventory bi ON bi.product_id = p.id AND bi.branch_id = $1
       WHERE p.status = 'Active'
       ORDER BY p.name`,
      [customer.branch_id]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[CustomerPortal] GET /products error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load products.' });
  }
});

router.get('/purchase-requests', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const result = await pool.query(
      `SELECT pr.request_id, pr.status, pr.notes, pr.created_at, pr.updated_at,
              COALESCE(u.first_name || ' ' || u.last_name, 'Unassigned') AS sales_agent_name
       FROM purchase_requests pr
       LEFT JOIN users u ON u.id = pr.sales_agent_id
       WHERE pr.customer_id = $1
       ORDER BY pr.created_at DESC`,
      [customer.customer_id]
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

    const data = result.rows.map((row) => ({
      ...row,
      items: itemsByRequest[row.request_id] || [],
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[CustomerPortal] GET /purchase-requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load purchase requests.' });
  }
});

router.post('/purchase-requests', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const { items, notes } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: 'At least one product line is required.' });
    }

    const normalized = items.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
      notes: item.notes ? String(item.notes).trim() : null,
    }));

    if (normalized.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0
      || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return res.status(400).json({ success: false, message: 'Each item needs a valid product and quantity.' });
    }

    const salesAgentId = await resolveSalesAgentIdForCustomer(pool, customer.customer_id);
    if (!salesAgentId) {
      return res.status(400).json({
        success: false,
        message: 'No sales agent is assigned to your account yet. Please contact your branch.',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const requestResult = await client.query(
        `INSERT INTO purchase_requests (customer_id, branch_id, sales_agent_id, status, notes)
         VALUES ($1, $2, $3, 'Pending', $4)
         RETURNING request_id, status, created_at`,
        [customer.customer_id, customer.branch_id, salesAgentId, notes ? String(notes).trim() : null]
      );
      const requestId = requestResult.rows[0].request_id;

      for (const item of normalized) {
        await client.query(
          `INSERT INTO purchase_request_items (request_id, product_id, quantity, notes)
           VALUES ($1, $2, $3, $4)`,
          [requestId, item.product_id, item.quantity, item.notes]
        );
      }
      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        message: 'Purchase request submitted. Your sales agent will review it.',
        data: { request_id: requestId, ...requestResult.rows[0] },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[CustomerPortal] POST /purchase-requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit purchase request.' });
  }
});

const PAYMENT_SELECT = `
  cp.collectionpayment_id,
  cp.amount,
  cp.payment_date,
  cp.payment_time,
  cp.status,
  cp.notes,
  cp.receipt_number AS collection_receipt_number,
  pm.method_name AS payment_method,
  COALESCE(NULLIF(CONCAT_WS(' ', col.first_name, col.last_name), ''), 'Collector') AS collector_name,
  dr.receipts_id,
  COALESCE(dr.receipt_number, cp.receipt_number) AS receipt_number,
  dr.receipt_date
`;

router.get('/payments', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const { start_date: startDate, end_date: endDate, payment_method: paymentMethod } = req.query;
    const conditions = ['cp.customer_id = $1'];
    const params = [customer.customer_id];
    let pIdx = 2;

    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
      conditions.push(`cp.payment_date >= $${pIdx++}`);
      params.push(startDate);
    }
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
      conditions.push(`cp.payment_date <= $${pIdx++}`);
      params.push(endDate);
    }
    if (paymentMethod && paymentMethod !== 'All') {
      conditions.push(`pm.method_name ILIKE $${pIdx++}`);
      params.push(paymentMethod);
    }

    const result = await pool.query(
      `SELECT ${PAYMENT_SELECT}
       FROM collection_payment cp
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       LEFT JOIN users col ON col.id = cp.collector_id
       LEFT JOIN digital_receipts dr ON dr.collection_id = cp.collectionpayment_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY cp.payment_date DESC, cp.payment_time DESC NULLS LAST, cp.collectionpayment_id DESC`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[CustomerPortal] GET /payments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load payment history.' });
  }
});

router.get('/receipts', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const result = await pool.query(
      `SELECT ${PAYMENT_SELECT}
       FROM digital_receipts dr
       JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       LEFT JOIN users col ON col.id = cp.collector_id
       WHERE cp.customer_id = $1
       ORDER BY dr.receipt_date DESC, dr.receipts_id DESC`,
      [customer.customer_id]
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[CustomerPortal] GET /receipts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load digital receipts.' });
  }
});

router.get('/receipts/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const receiptId = Number(req.params.id);
    if (!Number.isFinite(receiptId)) {
      return res.status(400).json({ success: false, message: 'Invalid receipt ID.' });
    }

    const result = await pool.query(
      `SELECT ${PAYMENT_SELECT},
              c.customer_code,
              c.address AS customer_address,
              c.contact_phone AS customer_phone,
              b.name AS branch_name
       FROM digital_receipts dr
       JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       JOIN customers c ON c.customer_id = cp.customer_id
       JOIN branches b ON b.id = cp.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       LEFT JOIN users col ON col.id = cp.collector_id
       WHERE dr.receipts_id = $1 AND cp.customer_id = $2`,
      [receiptId, customer.customer_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[CustomerPortal] GET /receipts/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load receipt.' });
  }
});

router.get('/statements/summary', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customer = await getLinkedCustomer(pool, req.currentUser.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const payments = await pool.query(
      `SELECT DATE_TRUNC('month', cp.payment_date)::date AS month_start,
              COALESCE(SUM(cp.amount), 0) AS total_paid
       FROM collection_payment cp
       WHERE cp.customer_id = $1
       GROUP BY DATE_TRUNC('month', cp.payment_date)
       ORDER BY month_start DESC
       LIMIT 12`,
      [customer.customer_id]
    );

    return res.status(200).json({
      success: true,
      data: {
        outstanding_balance: Number(customer.outstanding_balance || 0),
        months: payments.rows.map((row) => ({
          month_start: row.month_start,
          total_paid: Number(row.total_paid),
        })),
      },
    });
  } catch (err) {
    console.error('[CustomerPortal] GET /statements/summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load statement summary.' });
  }
});

export default router;
