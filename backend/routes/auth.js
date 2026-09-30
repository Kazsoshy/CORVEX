import express from 'express';
import bcrypt from 'bcryptjs';
import { issueSessionToken, requireAuth } from '../middleware/auth.js';
import { activatePortalAccount, hashPortalToken } from '../lib/customerPortal.js';

const router = express.Router();

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function clientAddress(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function tooManyAttempts(address) {
  const now = Date.now();
  const recent = (loginAttempts.get(address) || []).filter((stamp) => now - stamp < LOGIN_WINDOW_MS);
  loginAttempts.set(address, recent);
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

function recordAttempt(address) {
  const recent = loginAttempts.get(address) || [];
  recent.push(Date.now());
  loginAttempts.set(address, recent);
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  const address = clientAddress(req);
  if (tooManyAttempts(address)) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts. Try again later.',
    });
  }

  try {
    const pool = req.app.locals.pool;

    // Fetch user with role info
    const result = await pool.query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.password_hash,
         u.status,
         u.created_at,
         r.role_id,
         r.role_name,
         r.slug AS role_slug,
         b.id AS branch_id,
         b.name AS branch_name,
         CONCAT(u.first_name, ' ', u.last_name) AS full_name,
         c.customer_id,
         c.customer_code
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN customers c ON c.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      recordAttempt(address);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    if (user.status === 'Invited') {
      recordAttempt(address);
      return res.status(403).json({
        success: false,
        message: 'Your portal account is not activated yet. Use the activation link sent to your email.',
      });
    }

    if (user.status !== 'Active') {
      recordAttempt(address);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      recordAttempt(address);
      await pool.query(
        `INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details)
         VALUES ($1, $2, 'Login Failed', $3, 'Invalid password')`,
        [user.id, user.full_name, req.ip]
      );
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Log successful login
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details)
       VALUES ($1, $2, 'Login', $3, 'Successful login')`,
      [user.id, user.full_name, req.ip]
    );

    // Return user info (never return password)
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token: issueSessionToken(user.id),
      user: {
        id:             user.id,
        fullName:       user.full_name,
        email:          user.email,
        status:         user.status,
        role: {
          id:   user.role_id,
          name: user.role_name,
          slug: user.role_slug,
        },
        branch: user.branch_id ? {
          id:   user.branch_id,
          name: user.branch_name,
        } : null,
        customerId: user.customer_id ?? null,
        customerCode: user.customer_code ?? null,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.get('/portal/invitation/:token', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const tokenHash = hashPortalToken(req.params.token);
    const result = await pool.query(
      `SELECT i.expires_at, i.activated_at, c.customer_code, c.first_name, c.last_name, u.email
       FROM customer_portal_invitations i
       JOIN customers c ON c.customer_id = i.customer_id
       JOIN users u ON u.id = i.user_id
       WHERE i.token_hash = $1`,
      [tokenHash]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Invalid activation link.' });
    }
    const row = result.rows[0];
    if (row.activated_at) {
      return res.status(400).json({ success: false, message: 'This account is already activated. Please log in.' });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'This activation link has expired.' });
    }
    return res.status(200).json({
      success: true,
      data: {
        email: row.email,
        customerCode: row.customer_code,
        customerName: `${row.first_name} ${row.last_name}`.trim(),
        expiresAt: row.expires_at,
      },
    });
  } catch (err) {
    console.error('[Auth] GET /portal/invitation error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to validate invitation.' });
  }
});

router.post('/portal/activate', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { token, password, confirm_password } = req.body;
    if (confirm_password !== undefined && password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    const outcome = await activatePortalAccount(pool, { token, password });
    if (!outcome.ok) {
      return res.status(outcome.status || 400).json({ success: false, message: outcome.message });
    }
    return res.status(200).json({
      success: true,
      message: 'Account activated. You can now log in with your email and password.',
      data: { email: outcome.email, customerId: outcome.customerId },
    });
  } catch (err) {
    console.error('[Auth] POST /portal/activate error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to activate account.' });
  }
});

// GET /api/auth/me — current user profile (including phone)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser.id;
    const result = await pool.query(
      `SELECT
         u.id AS user_id,
         u.branch_id,
         u.role_id,
         u.first_name,
         u.middle_name,
         u.last_name,
         u.email,
         u.phone,
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
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const row = result.rows[0];
    return res.status(200).json({
      success: true,
      data: {
        user_id: row.user_id,
        first_name: row.first_name,
        middle_name: row.middle_name || null,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone || null,
        status: row.status,
        role: { id: row.role_id, name: row.role_name, slug: row.role_slug },
        branch: row.branch_id ? { id: row.branch_id, name: row.branch_name } : null,
      },
    });
  } catch (err) {
    console.error('[Auth] GET /me error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
});

// PUT /api/auth/me — update own profile (name, email, phone, password)
router.put('/me', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser.id;
    const { first_name, middle_name, last_name, email, phone, password } = req.body;

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (first_name) { updates.push(`first_name = $${pIdx++}`); params.push(String(first_name).trim()); }
    if (middle_name !== undefined) {
      updates.push(`middle_name = $${pIdx++}`);
      params.push(middle_name ? String(middle_name).trim() : null);
    }
    if (last_name) { updates.push(`last_name = $${pIdx++}`); params.push(String(last_name).trim()); }
    if (email) { updates.push(`email = $${pIdx++}`); params.push(String(email).toLowerCase().trim()); }
    if (phone !== undefined) {
      updates.push(`phone = $${pIdx++}`);
      params.push(phone ? String(phone).trim() : null);
    }
    if (password) {
      if (String(password).length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${pIdx++}`);
      params.push(hash);
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    params.push(userId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`,
      params
    );

    const result = await pool.query(
      `SELECT
         u.id AS user_id,
         u.first_name,
         u.middle_name,
         u.last_name,
         u.email,
         u.phone,
         u.status,
         r.role_name,
         r.slug AS role_slug,
         b.name AS branch_name,
         u.branch_id,
         u.role_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [userId]
    );
    const row = result.rows[0];
    return res.status(200).json({
      success: true,
      message: 'Profile updated.',
      data: {
        user_id: row.user_id,
        first_name: row.first_name,
        middle_name: row.middle_name || null,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone || null,
        status: row.status,
        role: { id: row.role_id, name: row.role_name, slug: row.role_slug },
        branch: row.branch_id ? { id: row.branch_id, name: row.branch_name } : null,
      },
    });
  } catch (err) {
    console.error('[Auth] PUT /me error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

export default router;
