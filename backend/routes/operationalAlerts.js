import express from 'express';
import { requireAuth, isUnscoped, ROLE_SETS, requireRole } from '../middleware/auth.js';
import { writeAuditFromReq, AUDIT_STATUS } from '../lib/auditLog.js';
import {
  listOperationalAlerts,
  ALERT_CATEGORIES,
} from '../lib/operationalAlerts.js';

const router = express.Router();
const ALERT_ROLES = [...new Set([...ROLE_SETS.branchOps, 'operating_manager', 'super_admin', 'branch_manager'])];

router.use(requireAuth, requireRole(ALERT_ROLES));

function scopedBranchId(user) {
  if (isUnscoped(user)) return null;
  return user.branchId;
}

async function loadAlertOrForbid(pool, user, alertId) {
  const existing = await pool.query(
    `SELECT * FROM operational_alerts WHERE alert_id = $1`,
    [alertId]
  );
  if (!existing.rows.length) {
    return { error: { status: 404, message: 'Alert not found.' } };
  }
  const row = existing.rows[0];
  if (!isUnscoped(user) && row.branch_id !== user.branchId) {
    return { error: { status: 403, message: 'Alert is outside your branch.' } };
  }
  return { row };
}

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const {
      status,
      severity,
      category,
      assigned_to: assignedTo,
      mine,
      search,
      limit,
    } = req.query;

    const rows = await listOperationalAlerts(pool, {
      branchId: scopedBranchId(user),
      status: status || undefined,
      severity: severity || undefined,
      category: category || undefined,
      assignedTo: assignedTo != null && assignedTo !== '' ? Number(assignedTo) : undefined,
      assignedToMe: String(mine || '') === '1' || String(mine || '').toLowerCase() === 'true',
      userId: user.id,
      search: search || undefined,
      criticalFirst: true,
      limit: limit ? Number(limit) : 200,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      meta: {
        categories: ALERT_CATEGORIES,
        count: rows.length,
      },
    });
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
    if (!Number.isInteger(alertId) || alertId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid alert id.' });
    }

    const { error, row } = await loadAlertOrForbid(pool, user, alertId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const {
      status,
      assigned_to: assignedTo,
      resolution_note: resolutionNote,
      escalate,
      escalation_reason: escalationReason,
    } = req.body || {};

    const updates = [];
    const params = [];
    let idx = 1;
    let auditActivity = 'Update Alert';
    let auditDescription = `Updated operational alert #${alertId}.`;

    // Assign to me / clear
    if (assignedTo !== undefined) {
      const nextAssignee = assignedTo ? Number(assignedTo) : null;
      if (nextAssignee != null && nextAssignee !== user.id && !isUnscoped(user)) {
        // BM desk: Assign to Me only (no assigning other roles in this revision).
        return res.status(400).json({
          success: false,
          message: 'Assign to Me only. Reassignment to other users is not enabled.',
        });
      }
      updates.push(`assigned_to = $${idx++}`);
      params.push(nextAssignee);
      if (nextAssignee) {
        updates.push('assigned_at = CURRENT_TIMESTAMP');
        auditActivity = 'Assign Alert';
        auditDescription = `Assigned operational alert #${alertId} to self.`;
      } else {
        updates.push('assigned_at = NULL');
        auditActivity = 'Unassign Alert';
        auditDescription = `Cleared assignee on operational alert #${alertId}.`;
      }
    }

    // Escalate (keeps Open; records reason + timestamp; notifies OM via audit)
    if (escalate === true || escalate === '1') {
      const reason = String(escalationReason || '').trim();
      if (!reason) {
        return res.status(400).json({ success: false, message: 'escalation_reason is required.' });
      }
      if (row.status === 'Resolved') {
        return res.status(400).json({ success: false, message: 'Cannot escalate a resolved alert.' });
      }
      updates.push(`escalated_at = CURRENT_TIMESTAMP`);
      updates.push(`escalation_reason = $${idx++}`);
      params.push(reason.slice(0, 2000));
      auditActivity = 'Escalate Alert';
      auditDescription = `Escalated operational alert #${alertId}: ${reason.slice(0, 200)}`;
    }

    // Resolve
    if (status === 'Resolved') {
      const note = String(resolutionNote || '').trim();
      if (!note) {
        return res.status(400).json({ success: false, message: 'resolution_note is required to resolve an alert.' });
      }
      updates.push(`status = $${idx++}`);
      params.push('Resolved');
      updates.push('resolved_at = CURRENT_TIMESTAMP');
      updates.push(`resolved_by = $${idx++}`);
      params.push(user.id);
      updates.push(`resolution_note = $${idx++}`);
      params.push(note.slice(0, 2000));
      auditActivity = 'Resolve Alert';
      auditDescription = `Resolved operational alert #${alertId}.`;
    } else if (status === 'Open') {
      updates.push(`status = $${idx++}`);
      params.push('Open');
      updates.push('resolved_at = NULL');
      updates.push('resolved_by = NULL');
      updates.push('resolution_note = NULL');
      auditActivity = 'Reopen Alert';
      auditDescription = `Reopened operational alert #${alertId}.`;
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No updates provided.' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(alertId);

    const result = await pool.query(
      `UPDATE operational_alerts
       SET ${updates.join(', ')}
       WHERE alert_id = $${idx}
       RETURNING *`,
      params
    );

    await writeAuditFromReq(pool, req, {
      module: 'Operations',
      activity: auditActivity,
      action: auditActivity,
      description: auditDescription,
      status: status === 'Resolved' ? AUDIT_STATUS.UPDATED : AUDIT_STATUS.UPDATED,
      affectedRecord: `alert:${alertId}`,
      branchId: row.branch_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Alert updated.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[OperationalAlerts] PATCH /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update alert.' });
  }
});

export default router;
