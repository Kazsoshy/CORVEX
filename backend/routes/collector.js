import express from 'express';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// All routes here require the collector role
router.use(requireRole(['collector']));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/payments
// Returns all collection_payment rows for the logged-in collector.
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
       JOIN customers c   ON c.customer_id       = cp.customer_id
       JOIN users u       ON u.id                = cp.collector_id
       JOIN branches b    ON b.id                = cp.branch_id
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
    console.error('[Collector] GET /payments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch collection payments',
      error: error.message,
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/receipts
// Returns all digital_receipts for the logged-in collector with full joins.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/receipts', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         dr.receipts_id,
         dr.collection_id,
         cp.receipt_number       AS collection_receipt_number,
         dr.receipt_number,
         dr.receipt_date,
         dr.generated_by,
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS generated_by_name,
         cp.amount,
         cp.payment_date,
         cp.payment_time,
         cp.status               AS payment_status,
         cp.customer_id,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
         b.name                  AS branch_name,
         COALESCE(pm.method_name, '—') AS payment_method
       FROM digital_receipts dr
       JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       JOIN users u               ON u.id                    = dr.generated_by
       JOIN customers c           ON c.customer_id           = cp.customer_id
       JOIN branches b            ON b.id                    = cp.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id  = cp.payment_method_id
       WHERE dr.generated_by = $1
       ORDER BY dr.receipt_date DESC, dr.receipts_id DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[Collector] GET /receipts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch digital receipts',
      error: error.message,
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/receipts/:id
// Returns a single digital receipt by receipts_id.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/receipts/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: 'Invalid receipt ID.' });
  }

  try {
    const result = await pool.query(
      `SELECT
         dr.receipts_id,
         dr.collection_id,
         dr.receipt_number,
         dr.receipt_date,
         dr.generated_by,
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS generated_by_name,
         cp.amount,
         cp.payment_date,
         cp.payment_time,
         cp.status               AS payment_status,
         cp.notes,
         cp.customer_id,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
         c.address               AS customer_address,
         c.contact_phone         AS customer_phone,
         b.name                  AS branch_name,
         COALESCE(pm.method_name, '—') AS payment_method
       FROM digital_receipts dr
       JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       JOIN users u               ON u.id                    = dr.generated_by
       JOIN customers c           ON c.customer_id           = cp.customer_id
       JOIN branches b            ON b.id                    = cp.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id  = cp.payment_method_id
       WHERE dr.receipts_id = $1
         AND dr.generated_by = $2`,
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[Collector] GET /receipts/:id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch receipt',
      error: error.message,
    });
  }
});

export default router;
