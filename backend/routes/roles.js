import express from 'express';
import { allow, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(allow(ROLE_SETS.userAdmin, ROLE_SETS.roleAdmin));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/roles  — List roles with their permission sets
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    // All roles
    const rolesResult = await pool.query(
      `SELECT role_id, role_name, slug, created_at, updated_at FROM roles ORDER BY role_id`
    );

    // All permissions
    const permsResult = await pool.query(
      `SELECT permission_id, label, description, created_at FROM permissions ORDER BY permission_id`
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
router.put('/:id/permissions', async (req, res) => {
  const pool = req.app.locals.pool;
  const roleId = Number(req.params.id);
  const { permissions } = req.body;

  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ success: false, message: 'permissions object is required.' });
  }

  // Prevent editing Super Admin
  const roleCheck = await pool.query(`SELECT slug FROM roles WHERE role_id = $1`, [roleId]);
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
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { role_name, slug } = req.body;
    if (!role_name || !slug) return res.status(400).json({ success: false, message: 'Missing fields.' });
    
    const result = await pool.query(
      `INSERT INTO roles (role_name, slug) VALUES ($1, $2) RETURNING *`,
      [role_name.trim(), slug.trim()]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Roles] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create role.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/roles/:id  — Update role
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
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
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Roles] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update role.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/roles/:id  — Delete role
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const roleId = Number(req.params.id);
    
    const check = await pool.query(`SELECT slug FROM roles WHERE role_id = $1`, [roleId]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Role not found.' });
    if (check.rows[0].slug === 'super_admin') return res.status(403).json({ success: false, message: 'Cannot delete Super Admin role.' });
    
    // Note: this will cascade delete role_permissions due to ON DELETE CASCADE
    await pool.query(`DELETE FROM roles WHERE role_id = $1`, [roleId]);
    return res.status(200).json({ success: true, message: 'Role deleted.' });
  } catch (err) {
    console.error('[Roles] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete role.' });
  }
});

export default router;
