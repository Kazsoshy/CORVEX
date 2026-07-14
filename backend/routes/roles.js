import express from 'express';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/roles  — List roles with their permission sets
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    // All roles
    const rolesResult = await pool.query(
      `SELECT id, name, slug, description FROM roles ORDER BY id`
    );

    // All permissions
    const permsResult = await pool.query(
      `SELECT id, key, label, description FROM permissions ORDER BY id`
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
      id:          role.id,
      name:        role.name,
      slug:        role.slug,
      description: role.description,
      permissions: Object.fromEntries(
        permissions.map((p) => [p.key, !!(rpMap[role.id]?.[p.id])])
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
// Body: { permissions: { view: true, create: false, ... } }
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/permissions', async (req, res) => {
  const pool = req.app.locals.pool;
  const roleId = Number(req.params.id);
  const { permissions } = req.body;

  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ success: false, message: 'permissions object is required.' });
  }

  // Prevent editing Super Admin
  const roleCheck = await pool.query(`SELECT slug FROM roles WHERE id = $1`, [roleId]);
  if (roleCheck.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Role not found.' });
  }
  if (roleCheck.rows[0].slug === 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super Admin permissions cannot be modified.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const permsResult = await client.query(`SELECT id, key FROM permissions`);
    const permMap = Object.fromEntries(permsResult.rows.map((p) => [p.key, p.id]));

    for (const [key, granted] of Object.entries(permissions)) {
      const permId = permMap[key];
      if (!permId) continue;
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

export default router;
