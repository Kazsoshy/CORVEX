import express from 'express';
import { requireAuth, isUnscoped, ROLE_SETS, requireRole } from '../middleware/auth.js';

const router = express.Router();
const ALERT_ROLES = [...new Set([...ROLE_SETS.branchOps, 'operating_manager', 'super_admin', 'branch_manager'])];

router.use(requireAuth, requireRole(ALERT_ROLES));

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { status, severity } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (!isUnscoped(user)) {
      conditions.push(`oa.branch_id = $${idx++}`);
      params.push(user.branchId);
    }
    if (status && status !== 'All') {
      conditions.push(`oa.status = $${idx++}`);
      params.push(status);
    }
    if (severity && severity !== 'All') {
      conditions.push(`oa.severity = $${idx++}`);
      params.push(severity);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT oa.alert_id, oa.branch_id, oa.alert_type, oa.severity, oa.title, oa.message,
              oa.status, oa.assigned_to, oa.resolved_at, oa.created_at, oa.updated_at,
              b.name AS branch_name,
              asg.full_name AS assigned_to_name
       FROM operational_alerts oa
       LEFT JOIN branches b ON b.id = oa.branch_id
       LEFT JOIN users asg ON asg.id = oa.assigned_to
       ${where}
       ORDER BY oa.created_at DESC
       LIMIT 200`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[OperationalAlerts] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load alerts.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const alertId = Number(req.params.id);
    const { status, assigned_to: assignedTo } = req.body;

    const existing = await pool.query(
      `SELECT alert_id, branch_id FROM operational_alerts WHERE alert_id = $1`,
      [alertId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }
    if (!isUnscoped(user) && existing.rows[0].branch_id !== user.branchId) {
      return res.status(403).json({ success: false, message: 'Alert is outside your branch.' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (status === 'Resolved') {
      updates.push(`status = $${idx++}`);
      params.push('Resolved');
      updates.push(`resolved_at = CURRENT_TIMESTAMP`);
    } else if (status === 'Open') {
      updates.push(`status = $${idx++}`);
      params.push('Open');
      updates.push(`resolved_at = NULL`);
    }
    if (assignedTo !== undefined) {
      updates.push(`assigned_to = $${idx++}`);
      params.push(assignedTo ? Number(assignedTo) : null);
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No updates provided.' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(alertId);

    const result = await pool.query(
      `UPDATE operational_alerts SET ${updates.join(', ')} WHERE alert_id = $${idx} RETURNING alert_id, status, assigned_to`,
      params
    );

    return res.status(200).json({ success: true, message: 'Alert updated.', data: result.rows[0] });
  } catch (err) {
    console.error('[OperationalAlerts] PATCH /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update alert.' });
  }
});

export default router;
