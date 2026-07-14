import express from 'express';
import bcrypt from 'bcryptjs';

const router = express.Router();

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
      conditions.push(`(u.full_name ILIKE $${pIdx} OR u.email ILIKE $${pIdx} OR u.username ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT
         u.id, u.full_name, u.username, u.email,
         u.employee_id, u.avatar_initials, u.contact_number,
         u.address, u.status, u.last_login, u.created_at, u.updated_at,
         r.id AS role_id, r.name AS role_name, r.slug AS role_slug,
         b.id AS branch_id, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
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
         u.id, u.full_name, u.username, u.email,
         u.employee_id, u.avatar_initials, u.contact_number,
         u.address, u.status, u.last_login, u.created_at, u.updated_at,
         r.id AS role_id, r.name AS role_name, r.slug AS role_slug,
         b.id AS branch_id, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
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
      full_name, username, email, password, role_id,
      branch_id, contact_number, address, employee_id,
      avatar_initials, status = 'Active',
    } = req.body;

    // Validate required fields
    const missing = [];
    if (!full_name)  missing.push('full_name');
    if (!username)   missing.push('username');
    if (!email)      missing.push('email');
    if (!password)   missing.push('password');
    if (!role_id)    missing.push('role_id');
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Check uniqueness
    const dupCheck = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2`,
      [email.toLowerCase().trim(), username.toLowerCase().trim()]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or username already in use.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
         (full_name, username, email, password_hash, role_id, branch_id,
          contact_number, address, employee_id, avatar_initials, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        full_name.trim(),
        username.toLowerCase().trim(),
        email.toLowerCase().trim(),
        password_hash,
        Number(role_id),
        branch_id ? Number(branch_id) : null,
        contact_number || null,
        address || null,
        employee_id || null,
        (avatar_initials || full_name.split(' ').map(w => w[0]).join('').slice(0, 4)).toUpperCase(),
        status,
      ]
    );

    const newUser = await pool.query(
      `SELECT u.*, r.name AS role_name, r.slug AS role_slug, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [result.rows[0].id]
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
      full_name, username, email, password, role_id,
      branch_id, contact_number, address, employee_id,
      avatar_initials, status,
    } = req.body;

    // Check user exists
    const existing = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Build update fields dynamically
    const updates = [];
    const params = [];
    let pIdx = 1;

    if (full_name)       { updates.push(`full_name = $${pIdx++}`);       params.push(full_name.trim()); }
    if (username)        { updates.push(`username = $${pIdx++}`);        params.push(username.toLowerCase().trim()); }
    if (email)           { updates.push(`email = $${pIdx++}`);           params.push(email.toLowerCase().trim()); }
    if (role_id)         { updates.push(`role_id = $${pIdx++}`);         params.push(Number(role_id)); }
    if (branch_id !== undefined) { updates.push(`branch_id = $${pIdx++}`); params.push(branch_id ? Number(branch_id) : null); }
    if (contact_number !== undefined) { updates.push(`contact_number = $${pIdx++}`); params.push(contact_number || null); }
    if (address !== undefined)        { updates.push(`address = $${pIdx++}`);         params.push(address || null); }
    if (employee_id !== undefined)    { updates.push(`employee_id = $${pIdx++}`);     params.push(employee_id || null); }
    if (avatar_initials)              { updates.push(`avatar_initials = $${pIdx++}`); params.push(avatar_initials.toUpperCase()); }
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
      `SELECT u.*, r.name AS role_name, r.slug AS role_slug, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
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

    const result = await pool.query(
      `UPDATE users SET status = 'Inactive', updated_at = NOW() WHERE id = $1 RETURNING id`,
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
// Helper: format user row for response (strip password_hash)
// ──────────────────────────────────────────────────────────────────────────────
function formatUser(row) {
  return {
    id:             row.id,
    fullName:       row.full_name,
    username:       row.username,
    email:          row.email,
    employeeId:     row.employee_id,
    avatarInitials: row.avatar_initials,
    contactNumber:  row.contact_number,
    address:        row.address,
    status:         row.status,
    lastLogin:      row.last_login,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
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
