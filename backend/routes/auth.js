import express from 'express';
import bcrypt from 'bcryptjs';
import { issueSessionToken } from '../middleware/auth.js';

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
         CONCAT(u.first_name, ' ', u.last_name) AS full_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      recordAttempt(address);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = result.rows[0];

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
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;
