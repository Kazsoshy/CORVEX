import express from 'express';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// All routes here require the collector role
router.use(requireRole(['collector']));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/payments
// Returns all collection_payment rows for the logged-in collector.
// ──────────────────────────────────────────────────────────────────────────────
const COLLECTION_PAYMENT_SELECT = `
  SELECT
    cp.collectionpayment_id,
    cp.customer_id,
    COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
    cp.collector_id,
    COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS collector_name,
    cp.branch_id,
    b.name AS branch_name,
    cp.payment_method_id,
    COALESCE(pm.method_name, '—') AS payment_method,
    dr.receipts_id,
    COALESCE(dr.receipt_number, cp.receipt_number) AS receipt_number,
    cp.amount,
    cp.payment_date,
    cp.payment_time,
    cp.status,
    cp.notes,
    cp.created_at,
    cp.updated_at
  FROM collection_payment cp
  JOIN customers c   ON c.customer_id = cp.customer_id
  JOIN users u       ON u.id          = cp.collector_id
  JOIN branches b    ON b.id          = cp.branch_id
  LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
  LEFT JOIN digital_receipts dr ON dr.collection_id = cp.collectionpayment_id
`;

router.get('/payments', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `${COLLECTION_PAYMENT_SELECT}
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
// GET /api/collector/payments/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/payments/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: 'Invalid payment ID.' });
  }

  try {
    const result = await pool.query(
      `${COLLECTION_PAYMENT_SELECT}
       WHERE cp.collectionpayment_id = $1 AND cp.collector_id = $2`,
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Collection payment not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[Collector] GET /payments/:id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch collection payment',
      error: error.message,
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/field-visits/today
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-visits/today', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         fv.visit_id,
         fv.customer_id,
         fv.visit_type,
         fv.scheduled_date,
         fv.status,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
       FROM field_visits fv
       JOIN customers c ON c.customer_id = fv.customer_id
       WHERE fv.user_id = $1
         AND (
           fv.scheduled_date = CURRENT_DATE
           OR (fv.status = 'Pending' AND fv.scheduled_date <= CURRENT_DATE)
         )
       ORDER BY fv.scheduled_date DESC, fv.status DESC, fv.visit_id ASC`,
      [userId]
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Collector] GET /field-visits/today error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch today\'s visits.', error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/field-reports
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         far.report_id,
         far.visit_id,
         far.activity_type,
         far.remarks,
         far.sync_status,
         far.created_at,
         fv.scheduled_date,
         fv.visit_type,
         fv.status AS visit_status,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
       FROM field_activity_reports far
       JOIN field_visits fv ON fv.visit_id = far.visit_id
       JOIN customers c ON c.customer_id = fv.customer_id
       WHERE far.user_id = $1
       ORDER BY far.created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Collector] GET /field-reports error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch field activity reports.', error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/collector/field-reports
// ──────────────────────────────────────────────────────────────────────────────
router.post('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const { visit_id, activity_type, remarks } = req.body;

  if (!visit_id || !activity_type || !String(remarks || '').trim()) {
    return res.status(400).json({
      success: false,
      message: 'visit_id, activity_type, and remarks are required.',
    });
  }

  try {
    const visitCheck = await pool.query(
      `SELECT visit_id FROM field_visits WHERE visit_id = $1 AND user_id = $2`,
      [Number(visit_id), userId]
    );

    if (!visitCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Visit not found for this collector.' });
    }

    const result = await pool.query(
      `INSERT INTO field_activity_reports (visit_id, user_id, activity_type, remarks, sync_status)
       VALUES ($1, $2, $3, $4, 'Pending')
       RETURNING report_id, visit_id, activity_type, remarks, sync_status, created_at`,
      [Number(visit_id), userId, String(activity_type).trim(), String(remarks).trim()]
    );

    return res.status(201).json({
      success: true,
      message: 'Field activity report submitted to Operating Manager.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[Collector] POST /field-reports error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit field activity report.', error: error.message });
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
         c.contact_person_phone  AS customer_contact_phone,
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
