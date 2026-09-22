import express from 'express';
import { requireRole, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(requireRole(ROLE_SETS.receipts));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/digital-receipts — List all digital receipts
// Restricted to super_admin and operating_manager
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { search, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (search) {
      conditions.push(`(dr.receipt_number ILIKE $${pIdx} OR u.full_name ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    params.push(Number(limit), offset);

    const result = await pool.query(
      `SELECT
         dr.receipts_id,
         dr.collection_id,
         dr.receipt_number,
         dr.receipt_date,
         dr.generated_by,
         u.full_name AS generated_by_name,
         cp.amount AS collection_amount,
         pm.method_name AS payment_method,
         c.first_name || ' ' || c.last_name AS customer_name
       FROM digital_receipts dr
       LEFT JOIN users u ON u.id = dr.generated_by
       LEFT JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       LEFT JOIN customers c ON c.customer_id = cp.customer_id
       ${where}
       ORDER BY dr.receipt_date DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[DigitalReceipts] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch digital receipts.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/digital-receipts/:id — Get single receipt
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const receiptId = Number(req.params.id);

    const result = await pool.query(
      `SELECT
         dr.receipts_id,
         dr.collection_id,
         dr.receipt_number,
         dr.receipt_date,
         dr.generated_by,
         u.full_name AS generated_by_name,
         cp.amount AS collection_amount,
         pm.method_name AS payment_method,
         c.first_name || ' ' || c.last_name AS customer_name,
         c.customer_id
       FROM digital_receipts dr
       LEFT JOIN users u ON u.id = dr.generated_by
       LEFT JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
       LEFT JOIN customers c ON c.customer_id = cp.customer_id
       WHERE dr.receipts_id = $1`,
      [receiptId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Digital receipt not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[DigitalReceipts] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch digital receipt.' });
  }
});

export default router;
