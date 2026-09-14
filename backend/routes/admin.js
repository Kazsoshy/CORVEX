import express from 'express';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-logs
// Fetch all audit logs from the database
// ──────────────────────────────────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT log_id, user_id, action, ip_address, status_details, created_at
       FROM audit_logs
       ORDER BY created_at DESC`
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Admin] GET /audit-logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

export default router;
