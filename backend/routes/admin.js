import express from 'express';
import { allow, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(allow(ROLE_SETS.audit));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-logs
// Fetch all audit logs from the database
// ──────────────────────────────────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT a.log_id, a.user_id, TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS user_name, a.action, a.ip_address, a.status_details, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC`
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Admin] GET /audit-logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

export default router;
