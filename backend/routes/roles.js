import express from 'express';
import { requirePermission } from '../middleware/auth.js';
import { recordPermissionChangeEvent } from '../lib/security/detectors.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';

const router = express.Router();
router.use(requirePermission(
  'roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'roles.assign',
));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/roles  — List roles with their permission sets
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const includeArchived = String(req.query.status || '').toLowerCase() === 'all';
    const statusFilter = includeArchived ? '' : `WHERE COALESCE(status, 'Active') = 'Active'`;

    // Active roles by default; pass status=all to include archived.
    const rolesResult = await pool.query(
      `SELECT role_id, role_name, slug, COALESCE(status, 'Active') AS status, created_at, updated_at
       FROM roles ${statusFilter} ORDER BY role_id`
    );

    // Active permissions by default (same status filter).
    const permsResult = await pool.query(
      `SELECT permission_id, label, description, module, code,
              COALESCE(status, 'Active') AS status, created_at
       FROM permissions ${statusFilter} ORDER BY permission_id`
    );

    // Role-permission mapping
    const rpResult = await pool.query(
      `SELECT role_id, permission_id, granted FROM role_permissions`
    );

    const permissions = permsResult.rows;
    const rpMap = {};
    for (const rp of rpResult.rows) {
      if (!rpMap[rp.role_id]) rpMap[rp.role_id] = {};
      rpMap[rp.role_id][rp.permission_id] = rp.granted;
    }

    const roles = rolesResult.rows.map((role) => ({
      id:          role.role_id,
      name:        role.role_name,
      slug:        role.slug,
      status:      role.status || 'Active',
      created_at:  role.created_at,
      updated_at:  role.updated_at,

      permissions: Object.fromEntries(
        permissions.map((p) => [p.permission_id, !!(rpMap[role.role_id]?.[p.permission_id])])
      ),
    }));

    return res.status(200).json({
      success: true,
      data: { roles, permissions },
    });
  } catch (err) {
    console.error('[Roles] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch roles.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/roles/:id/permissions  — Update permissions for a role
// Body: { permissions: { [permission_id]: true, ... } }
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/permissions', requirePermission('roles.assign'), async (req, res) => {
  const pool = req.app.locals.pool;
  const roleId = Number(req.params.id);
  const { permissions } = req.body;

  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ success: false, message: 'permissions object is required.' });
  }

  // Prevent editing Super Admin
  const roleCheck = await pool.query(`SELECT role_name, slug FROM roles WHERE role_id = $1`, [roleId]);
  if (roleCheck.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }
  if (roleCheck.rows[0].slug === 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super Admin permissions cannot be modified.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [key, granted] of Object.entries(permissions)) {
      const permId = Number(key);
      if (!permId || isNaN(permId)) continue;
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id, granted)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_id) DO UPDATE SET granted = $3, updated_at = NOW()`,
        [roleId, permId, Boolean(granted)]
      );
    }

    await client.query('COMMIT');

    try {
      await recordPermissionChangeEvent(pool, {
        actorId: req.currentUser?.id || null,
        actorName: req.currentUser?.fullName || req.currentUser?.email || 'Administrator',
        roleId,
        roleName: roleCheck.rows[0].role_name,
        roleSlug: roleCheck.rows[0].slug,
        changedPermissions: permissions,
        sourceIp: req.ip || null,
      });
    } catch (secErr) {
      console.error('[Roles] security permission monitor:', secErr.message);
    }

    await writeAuditFromReq(pool, req, {
      module: 'Roles and Permissions',
      activity: 'Update Permissions',
      action: 'Update Permissions',
      description: `Updated permissions for role ${roleCheck.rows[0].role_name} (${roleCheck.rows[0].slug}).`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `role:${roleId}`,
    });

    return res.status(200).json({ success: true, message: 'Permissions updated successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Roles] PUT /:id/permissions error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update permissions.' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/roles  — Create role
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', requirePermission('roles.create'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { role_name, slug } = req.body;
    if (!role_name || !slug) return res.status(400).json({ success: false, message: 'Missing fields.' });
    
    const result = await pool.query(
      `INSERT INTO roles (role_name, slug) VALUES ($1, $2) RETURNING *`,
      [role_name.trim(), slug.trim()]
    );
    await writeAuditFromReq(pool, req, {
      module: 'Roles and Permissions',
      activity: 'Create Role',
      action: 'Create Role',
      description: `Created role ${role_name.trim()} (${slug.trim()}).`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `role:${result.rows[0].role_id}`,
    });
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Roles] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create role.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/roles/:id  — Update role
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', requirePermission('roles.edit'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { role_name, slug } = req.body;
    const roleId = Number(req.params.id);
    
    // Prevent updating Super Admin
    const check = await pool.query(`SELECT slug FROM roles WHERE role_id = $1`, [roleId]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Role not found.' });
    if (check.rows[0].slug === 'super_admin') return res.status(403).json({ success: false, message: 'Cannot edit Super Admin role.' });
    
    const result = await pool.query(
      `UPDATE roles SET role_name = $1, slug = $2, updated_at = NOW() WHERE role_id = $3 RETURNING *`,
      [role_name.trim(), slug.trim(), roleId]
    );
    await writeAuditFromReq(pool, req, {
      module: 'Roles and Permissions',
      activity: 'Update Role',
      action: 'Update Role',
      description: `Updated role #${roleId} to ${role_name.trim()} (${slug.trim()}).`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `role:${roleId}`,
    });
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Roles] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update role.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/roles/:id  — Soft archive (status = Inactive; record kept)
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', requirePermission('roles.delete'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const roleId = Number(req.params.id);

    const check = await pool.query(
      `SELECT slug, COALESCE(status, 'Active') AS status FROM roles WHERE role_id = $1`,
      [roleId]
    );
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Role not found.' });
    if (check.rows[0].slug === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot archive Super Admin role.' });
    }
    if (check.rows[0].status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'Role is already archived.' });
    }

    const activeUsers = await pool.query(
      `SELECT id FROM users WHERE role_id = $1 AND status = 'Active' LIMIT 1`,
      [roleId]
    );
    if (activeUsers.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot archive role while active users are still assigned to it.',
      });
    }

    await pool.query(
      `UPDATE roles SET status = 'Inactive', updated_at = NOW() WHERE role_id = $1`,
      [roleId]
    );
    await writeAuditFromReq(pool, req, {
      module: 'Roles and Permissions',
      activity: 'Archive Role',
      action: 'Archive Role',
      description: `Archived role #${roleId}. Record preserved.`,
      status: AUDIT_STATUS.ARCHIVED,
      affectedRecord: `role:${roleId}`,
    });
    return res.status(200).json({
      success: true,
      message: 'Role archived successfully. The record is preserved.',
    });
  } catch (err) {
    console.error('[Roles] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to archive role.' });
  }
});

export default router;
