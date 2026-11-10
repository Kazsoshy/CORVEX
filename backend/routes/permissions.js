import express from 'express';
import { requirePermission } from '../middleware/auth.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';
import { groupPermissionsByModule, listCatalogPermissions } from '../lib/permissions.js';

const router = express.Router();
router.use(requirePermission(
  'roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'roles.assign',
));

// GET /api/permissions/catalog — Super Admin module permission definitions
router.get('/catalog', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const permissions = await listCatalogPermissions(pool);
    return res.status(200).json({
      success: true,
      data: {
        permissions,
        modules: groupPermissionsByModule(permissions),
      },
    });
  } catch (err) {
    console.error('[Permissions] GET /catalog error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch permission catalog.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/permissions  — List all permissions
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const includeArchived = String(req.query.status || '').toLowerCase() === 'all';
    const statusFilter = includeArchived ? '' : `WHERE COALESCE(status, 'Active') = 'Active'`;
    const result = await pool.query(
      `SELECT permission_id, label, description, module, code,
              COALESCE(status, 'Active') AS status, created_at, updated_at
       FROM permissions ${statusFilter} ORDER BY permission_id`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Permissions] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch permissions.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/permissions  — Create permission
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { label, description } = req.body;
    
    if (!label || !description) {
      return res.status(400).json({ success: false, message: 'Missing label or description.' });
    }
    
    const result = await pool.query(
      `INSERT INTO permissions (label, description) VALUES ($1, $2) RETURNING *`,
      [label.trim(), description.trim()]
    );
    await writeAuditFromReq(pool, req, {
      module: 'Roles and Permissions',
      activity: 'Create Permission',
      action: 'Create Permission',
      description: `Created permission ${label.trim()}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `permission:${result.rows[0].permission_id}`,
    });
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Permissions] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create permission.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/permissions/:id  — Update permission
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const permId = Number(req.params.id);
    const { label, description } = req.body;
    
    if (!label || !description) {
      return res.status(400).json({ success: false, message: 'Missing label or description.' });
    }
    
    const check = await pool.query(`SELECT permission_id FROM permissions WHERE permission_id = $1`, [permId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Permission not found.' });
    }
    
    const result = await pool.query(
      `UPDATE permissions SET label = $1, description = $2 WHERE permission_id = $3 RETURNING *`,
      [label.trim(), description.trim(), permId]
    );
    await writeAuditFromReq(pool, req, {
      module: 'Roles and Permissions',
      activity: 'Edit Permission',
      action: 'Edit Permission',
      description: `Edited permission ${label.trim()}.`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `permission:${permId}`,
    });
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Permissions] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update permission.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/permissions/:id  — Soft archive (status = Inactive; record kept)
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const permId = Number(req.params.id);

    const check = await pool.query(
      `SELECT permission_id, COALESCE(status, 'Active') AS status FROM permissions WHERE permission_id = $1`,
      [permId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Permission not found.' });
    }
    if (check.rows[0].status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'Permission is already archived.' });
    }

    await pool.query(
      `UPDATE permissions SET status = 'Inactive', updated_at = NOW() WHERE permission_id = $1`,
      [permId]
    );
    await writeAuditFromReq(pool, req, {
      module: 'Roles and Permissions',
      activity: 'Archive Permission',
      action: 'Archive Permission',
      description: `Archived permission #${permId}. Record preserved.`,
      status: AUDIT_STATUS.ARCHIVED,
      affectedRecord: `permission:${permId}`,
    });
    return res.status(200).json({
      success: true,
      message: 'Permission archived successfully. The record is preserved.',
    });
  } catch (err) {
    console.error('[Permissions] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to archive permission.' });
  }
});

export default router;
