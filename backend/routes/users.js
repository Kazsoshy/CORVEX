import express from 'express';
import bcrypt from 'bcryptjs';
import { allow, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(allow(ROLE_SETS.userAdmin));

async function roleSlug(pool, roleId) {
  const result = await pool.query(`SELECT slug FROM roles WHERE role_id = $1`, [Number(roleId)]);
  return result.rows[0]?.slug ?? null;
}

async function userRoleSlug(pool, userId) {
  const result = await pool.query(
    `SELECT r.slug FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.id = $1`,
    [Number(userId)]
  );
  return result.rows[0]?.slug ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users
// Query params: role (slug), status, branch_id, search, page, limit
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      role, status, branch_id, search,
      page = 1, limit = 20,
    } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (role) {
      conditions.push(`r.slug = $${pIdx++}`);
      params.push(role);
    }
    if (status) {
      conditions.push(`u.status = $${pIdx++}`);
      params.push(status);
    }
    if (branch_id) {
      conditions.push(`u.branch_id = $${pIdx++}`);
      params.push(Number(branch_id));
    }
    if (search) {
      conditions.push(`(u.first_name ILIKE $${pIdx} OR u.last_name ILIKE $${pIdx} OR u.email ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users u JOIN roles r ON r.role_id = u.role_id ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT
         u.id AS user_id,
         u.branch_id,
         u.role_id,
         u.first_name,
         u.middle_name,
         u.last_name,
         u.email,
         u.status,
         u.created_at,
         u.updated_at,
         r.role_name,
         r.slug AS role_slug,
         b.name AS branch_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, Number(limit), offset]
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map(formatUser),
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error('[Users] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      `SELECT
         u.id AS user_id,
         u.branch_id,
         u.role_id,
         u.first_name,
         u.last_name,
         u.email,
         u.status,
         u.created_at,
         u.updated_at,
         r.role_name,
         r.slug AS role_slug,
         b.name AS branch_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({ success: true, data: formatUser(result.rows[0]) });
  } catch (err) {
    console.error('[Users] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/users  — Create user
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      first_name, middle_name, last_name, email, password, role_id,
      branch_id, status = 'Active',
    } = req.body;

    // Validate required fields
    const missing = [];
    if (!first_name)  missing.push('first_name');
    if (!last_name)   missing.push('last_name');
    if (!email)      missing.push('email');
    if (!password)   missing.push('password');
    if (!role_id)    missing.push('role_id');
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const assignedSlug = await roleSlug(pool, role_id);
    if (!assignedSlug) {
      return res.status(400).json({ success: false, message: 'Role not found.' });
    }
    if (assignedSlug === 'super_admin' && req.currentUser.roleSlug !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Check uniqueness
    const dupCheck = await pool.query(
      `SELECT id AS user_id FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
         (first_name, middle_name, last_name, email, password_hash, role_id, branch_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id AS user_id`,
      [
        first_name.trim(),
        middle_name ? middle_name.trim() : null,
        last_name.trim(),
        email.toLowerCase().trim(),
        passwordHash,
        Number(role_id),
        branch_id ? Number(branch_id) : null,
        status,
      ]
    );

    const newUser = await pool.query(
      `SELECT
         u.id AS user_id,
         u.branch_id,
         u.role_id,
         u.first_name,
         u.last_name,
         u.email,
         u.status,
         u.created_at,
         u.updated_at,
         r.role_name,
         r.slug AS role_slug,
         b.name AS branch_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [result.rows[0].user_id]
    );

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: formatUser(newUser.rows[0]),
    });
  } catch (err) {
    console.error('[Users] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id  — Update user
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = Number(req.params.id);
    const {
      first_name, middle_name, last_name, email, password, role_id,
      branch_id, status,
    } = req.body;

    // Check user exists
    const existing = await pool.query(`SELECT id AS user_id FROM users WHERE id = $1`, [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const targetSlug = await userRoleSlug(pool, userId);
    if (targetSlug === 'super_admin' && req.currentUser.roleSlug !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (role_id) {
      const assignedSlug = await roleSlug(pool, role_id);
      if (!assignedSlug) {
        return res.status(400).json({ success: false, message: 'Role not found.' });
      }
      if (assignedSlug === 'super_admin' && req.currentUser.roleSlug !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    // Build update fields dynamically
    const updates = [];
    const params = [];
    let pIdx = 1;

    if (first_name)       { updates.push(`first_name = $${pIdx++}`);       params.push(first_name.trim()); }
    if (middle_name !== undefined) { updates.push(`middle_name = $${pIdx++}`); params.push(middle_name ? middle_name.trim() : null); }
    if (last_name)        { updates.push(`last_name = $${pIdx++}`);        params.push(last_name.trim()); }
    if (email)           { updates.push(`email = $${pIdx++}`);           params.push(email.toLowerCase().trim()); }
    if (role_id)         { updates.push(`role_id = $${pIdx++}`);         params.push(Number(role_id)); }
    if (branch_id !== undefined) { updates.push(`branch_id = $${pIdx++}`); params.push(branch_id ? Number(branch_id) : null); }
    if (status)          { updates.push(`status = $${pIdx++}`);          params.push(status); }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${pIdx++}`);
      params.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    params.push(userId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`,
      params
    );

    const updated = await pool.query(
      `SELECT
         u.id AS user_id,
         u.branch_id,
         u.role_id,
         u.first_name,
         u.last_name,
         u.email,
         u.status,
         u.created_at,
         u.updated_at,
         r.role_name,
         r.slug AS role_slug,
         b.name AS branch_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      data: formatUser(updated.rows[0]),
    });
  } catch (err) {
    console.error('[Users] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/:id  — Soft delete (set status = Inactive)
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = Number(req.params.id);
    const targetSlug = await userRoleSlug(pool, userId);
    if (!targetSlug) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (targetSlug === 'super_admin' && req.currentUser.roleSlug !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const result = await pool.query(
      `UPDATE users SET status = 'Inactive', updated_at = NOW() WHERE id = $1 RETURNING id AS user_id`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({ success: true, message: 'User deactivated successfully.' });
  } catch (err) {
    console.error('[Users] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to deactivate user.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helper: format user row for response (strip password)
// ──────────────────────────────────────────────────────────────────────────────
function formatUser(row) {
  return {
    user_id:       row.user_id,
    branch_id:     row.branch_id,
    role_id:       row.role_id,
    first_name:    row.first_name,
    middle_name:   row.middle_name || null,
    last_name:     row.last_name,
    email:         row.email,
    status:        row.status,
    created_at:    row.created_at,
    updated_at:    row.updated_at,
    role: {
      id:   row.role_id,
      name: row.role_name,
      slug: row.role_slug,
    },
    branch: row.branch_id ? {
      id:   row.branch_id,
      name: row.branch_name,
    } : null,
  };
}

export default router;
