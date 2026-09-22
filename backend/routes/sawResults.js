import express from 'express';
import { allow, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(allow(ROLE_SETS.receipts));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/saw-results — List all SAW results (view-only)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { search, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (search) {
      conditions.push(`(c.first_name ILIKE $${pIdx} OR c.last_name ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    params.push(Number(limit), offset);

    const result = await pool.query(
      `SELECT
         sr.result_id,
         sr.customer_id,
         c.first_name || ' ' || c.last_name AS customer_name,
         sr.score,
         sr.ranking,
         sr.generated_at
       FROM saw_results sr
       LEFT JOIN customers c ON c.customer_id = sr.customer_id
       ${where}
       ORDER BY sr.ranking ASC, sr.generated_at DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[SawResults] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch SAW results.' });
  }
});

export default router;
