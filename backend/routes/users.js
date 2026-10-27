import express from 'express';
import bcrypt from 'bcryptjs';
import { allow, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(allow(ROLE_SETS.userAdmin));

async function roleSlug(pool, roleId) {
  const result = await pool.query(`SELECT slug FROM roles WHERE role_id = $1`, [Number(roleId)]);
  return result.rows[0]?.slug ?? null;
}

const OP_BLOCKED_ROLE_SLUGS = new Set(['super_admin', 'operating_manager', 'client']);

function operatingManagerCannotAssign(actor, slug, currentSlug = null) {
  return actor?.roleSlug === 'operating_manager'
    && OP_BLOCKED_ROLE_SLUGS.has(slug)
    && slug !== currentSlug;
}

async function userRoleSlug(pool, userId) {
  const result = await pool.query(
    `SELECT r.slug FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.id = $1`,
    [Number(userId)]
  );
  return result.rows[0]?.slug ?? null;
}

/** Guards for soft-disable (status → Inactive). Returns an error payload or null. */
async function assertCanDisableUser(pool, actor, userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 404, message: 'User not found.' };
  }
  if (Number(actor?.id) === id) {
    return { status: 400, message: 'You cannot disable your own account.' };
  }

  const existing = await pool.query(
    `SELECT u.status, r.slug AS role_slug
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.id = $1`,
    [id]
  );
  if (existing.rows.length === 0) {
    return { status: 404, message: 'User not found.' };
  }

  const { status: currentStatus, role_slug: targetSlug } = existing.rows[0];
  if (currentStatus === 'Inactive') {
    return { status: 400, message: 'User is already disabled.' };
  }

  if (targetSlug === 'super_admin' && actor?.roleSlug !== 'super_admin') {
    return { status: 403, message: 'Access denied.' };
  }
  if (
    actor?.roleSlug === 'operating_manager'
    && (targetSlug === 'super_admin' || targetSlug === 'operating_manager')
  ) {
    return {
      status: 403,
      message: 'Operating managers cannot disable Super Admin or Operating Manager accounts.',
    };
  }

  if (targetSlug === 'super_admin') {
    const activeAdmins = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE r.slug = 'super_admin' AND u.status = 'Active'`
    );
    if (Number(activeAdmins.rows[0]?.count) <= 1) {
      return {
        status: 400,
        message: 'Cannot disable the last active Super Admin account.',
      };
    }
  }

  return null;
}

const USER_SELECT = `
  SELECT
    u.id AS user_id,
    u.branch_id,
    u.role_id,
    u.first_name,
    u.middle_name,
    u.last_name,
    u.email,
    u.username,
    u.phone,
    u.contact_number,
    u.employee_id,
    u.avatar_initials,
    u.status,
    u.created_at,
    u.updated_at,
    u.last_login,
    r.role_name,
    r.slug AS role_slug,
    b.name AS branch_name
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  LEFT JOIN branches b ON b.id = u.branch_id
`;

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users
// Query params: role (slug), status, branch_id, search, page, limit
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const {
      role, status, branch_id, search,
      page = 1, limit = 20,
    } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    // Branch-scoped roles may only list staff in their own branch.
    if (user?.branchId != null && !['super_admin', 'operating_manager'].includes(user.roleSlug)) {
      conditions.push(`u.branch_id = $${pIdx++}`);
      params.push(user.branchId);
    } else if (branch_id) {
      conditions.push(`u.branch_id = $${pIdx++}`);
      params.push(Number(branch_id));
    }

    if (role) {
      conditions.push(`r.slug = $${pIdx++}`);
      params.push(role);
    }
    if (status) {
      conditions.push(`u.status = $${pIdx++}`);
      params.push(status);
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
      `${USER_SELECT}
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
      `${USER_SELECT} WHERE u.id = $1`,
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
      first_name, middle_name, last_name, email, username, password, role_id,
      branch_id, status = 'Active', phone, contact_number, employee_id,
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
    if (operatingManagerCannotAssign(req.currentUser, assignedSlug)) {
      return res.status(403).json({
        success: false,
        message: 'Operating managers cannot assign Super Admin, Operating Manager, or Client.',
      });
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
    const fullName = [first_name, middle_name, last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const result = await pool.query(
      `INSERT INTO users
         (first_name, middle_name, last_name, full_name, email, username, password_hash,
          role_id, branch_id, status, phone, contact_number, employee_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id AS user_id`,
      [
        first_name.trim(),
        middle_name ? middle_name.trim() : null,
        last_name.trim(),
        fullName,
        email.toLowerCase().trim(),
        username ? String(username).trim() : null,
        passwordHash,
        Number(role_id),
        branch_id ? Number(branch_id) : null,
        status,
        (phone || contact_number) ? String(phone || contact_number).trim() : null,
        contact_number ? String(contact_number).trim() : null,
        employee_id ? String(employee_id).trim() : null,
      ]
    );

    const newUser = await pool.query(
      `${USER_SELECT} WHERE u.id = $1`,
      [result.rows[0].user_id]
    );

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: formatUser(newUser.rows[0]),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email or username is already in use.' });
    }
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
      first_name, middle_name, last_name, email, username, phone, contact_number,
      employee_id, password, role_id, branch_id, status,
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
      if (operatingManagerCannotAssign(req.currentUser, assignedSlug, targetSlug)) {
        return res.status(403).json({
          success: false,
          message: 'Operating managers cannot assign Super Admin, Operating Manager, or Client.',
        });
      }
    }
    if (status === 'Inactive') {
      const currentStatusRes = await pool.query(`SELECT status FROM users WHERE id = $1`, [userId]);
      const currentStatus = currentStatusRes.rows[0]?.status;
      if (currentStatus && currentStatus !== 'Inactive') {
        const disableBlock = await assertCanDisableUser(pool, req.currentUser, userId);
        if (disableBlock) {
          return res.status(disableBlock.status).json({ success: false, message: disableBlock.message });
        }
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
    if (username !== undefined) {
      updates.push(`username = $${pIdx++}`);
      params.push(username ? String(username).trim() : null);
    }
    if (phone !== undefined || contact_number !== undefined) {
      const nextPhone = phone !== undefined ? phone : contact_number;
      updates.push(`phone = $${pIdx++}`);
      params.push(nextPhone ? String(nextPhone).trim() : null);
    }
    if (contact_number !== undefined) {
      updates.push(`contact_number = $${pIdx++}`);
      params.push(contact_number ? String(contact_number).trim() : null);
    }
    if (employee_id !== undefined) {
      updates.push(`employee_id = $${pIdx++}`);
      params.push(employee_id ? String(employee_id).trim() : null);
    }
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
    await pool.query(
      `UPDATE users
       SET full_name = TRIM(CONCAT_WS(' ', first_name, NULLIF(middle_name, ''), last_name))
       WHERE id = $1`,
      [userId]
    );

    const updated = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [userId]);

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      data: formatUser(updated.rows[0]),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email or username is already in use.' });
    }
    console.error('[Users] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/:id  — Soft disable (set status = Inactive; record kept)
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = Number(req.params.id);
    const disableBlock = await assertCanDisableUser(pool, req.currentUser, userId);
    if (disableBlock) {
      return res.status(disableBlock.status).json({ success: false, message: disableBlock.message });
    }

    const result = await pool.query(
      `UPDATE users SET status = 'Inactive', updated_at = NOW()
       WHERE id = $1 AND status <> 'Inactive'
       RETURNING id AS user_id`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'User disabled successfully. Their record and history are preserved.',
    });
  } catch (err) {
    console.error('[Users] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to disable user.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helper: format user row for response (strip password)
// ──────────────────────────────────────────────────────────────────────────────
function formatUser(row) {
  const contact = row.contact_number || row.phone || null;
  return {
    id:            row.user_id,
    user_id:       row.user_id,
    branch_id:     row.branch_id,
    role_id:       row.role_id,
    first_name:    row.first_name,
    middle_name:   row.middle_name || null,
    last_name:     row.last_name,
    email:         row.email,
    username:      row.username || null,
    phone:         row.phone || contact,
    contact_number: contact,
    employee_id:   row.employee_id || null,
    employeeId:    row.employee_id || null,
    avatarInitials: row.avatar_initials || null,
    status:        row.status,
    created_at:    row.created_at,
    updated_at:    row.updated_at,
    last_login:    row.last_login || null,
    lastLogin:     row.last_login || null,
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
