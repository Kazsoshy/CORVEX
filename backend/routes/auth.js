import express from 'express';
import bcrypt from 'bcryptjs';
import { issueSessionToken, requireAuth } from '../middleware/auth.js';
import { activatePortalAccount, hashPortalToken } from '../lib/customerPortal.js';
import {
  avatarContentType,
  deleteAvatarFile,
  detectAvatarImage,
  readAvatarFile,
  saveAvatarFile,
} from '../lib/avatars.js';

const router = express.Router();

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function clientAddress(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function attemptKey(address, email) {
  return `${address}|${String(email || '').toLowerCase().trim()}`;
}

function tooManyAttempts(key) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((stamp) => now - stamp < LOGIN_WINDOW_MS);
  loginAttempts.set(key, recent);
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

function recordAttempt(key) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((stamp) => now - stamp < LOGIN_WINDOW_MS);
  recent.push(now);
  loginAttempts.set(key, recent);
  return recent.length;
}

function attemptNotice(attemptCount) {
  const remaining = LOGIN_MAX_ATTEMPTS - attemptCount;
  if (remaining <= 0) {
    return 'Too many login attempts for this account. Try again in 15 minutes.';
  }
  const attemptsLabel = remaining === 1 ? '1 attempt' : `${remaining} attempts`;
  return `${attemptsLabel} remaining before this account is locked for 15 minutes.`;
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

  const attempt = attemptKey(clientAddress(req), email);
  if (tooManyAttempts(attempt)) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts for this account. Try again in 15 minutes.',
      attemptsRemaining: 0,
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
         u.avatar_file,
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
      const attemptCount = recordAttempt(attempt);
      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${attemptNotice(attemptCount)}`,
        attemptsRemaining: Math.max(0, LOGIN_MAX_ATTEMPTS - attemptCount),
      });
    }

    const user = result.rows[0];

    if (user.status === 'Invited') {
      const attemptCount = recordAttempt(attempt);
      return res.status(403).json({
        success: false,
        message: `Your portal account is not activated yet. Use the activation link sent to your email. ${attemptNotice(attemptCount)}`,
        attemptsRemaining: Math.max(0, LOGIN_MAX_ATTEMPTS - attemptCount),
      });
    }

    if (user.status !== 'Active') {
      const attemptCount = recordAttempt(attempt);
      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${attemptNotice(attemptCount)}`,
        attemptsRemaining: Math.max(0, LOGIN_MAX_ATTEMPTS - attemptCount),
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      const attemptCount = recordAttempt(attempt);
      await pool.query(
        `INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details)
         VALUES ($1, $2, 'Login Failed', $3, 'Invalid password')`,
        [user.id, user.full_name, req.ip]
      );
      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${attemptNotice(attemptCount)}`,
        attemptsRemaining: Math.max(0, LOGIN_MAX_ATTEMPTS - attemptCount),
      });
    }

    loginAttempts.delete(attempt);

    await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

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
        hasAvatar: Boolean(user.avatar_file),
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.post('/touch', requireAuth, (req, res) => {
  res.json({ success: true });
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

const PROFILE_SELECT = `
  SELECT
    u.id AS user_id,
    u.branch_id,
    u.role_id,
    u.first_name,
    u.middle_name,
    u.last_name,
    u.full_name,
    u.email,
    u.phone,
    u.status,
    u.created_at,
    u.updated_at,
    u.last_login,
    u.avatar_file,
    r.role_name,
    r.slug AS role_slug,
    b.name AS branch_name
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  LEFT JOIN branches b ON b.id = u.branch_id
  WHERE u.id = $1
`;

function formatProfileRow(row) {
  const fullName = (
    row.full_name
    || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ')
  ).replace(/\s+/g, ' ').trim();
  return {
    user_id: row.user_id,
    first_name: row.first_name,
    middle_name: row.middle_name || null,
    last_name: row.last_name,
    full_name: fullName || null,
    email: row.email,
    phone: row.phone || null,
    status: row.status,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_login: row.last_login || null,
    has_avatar: Boolean(row.avatar_file),
    role: { id: row.role_id, name: row.role_name, slug: row.role_slug },
    branch: row.branch_id ? { id: row.branch_id, name: row.branch_name } : null,
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

// GET /api/auth/me — current user profile (including phone)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser.id;
    const result = await pool.query(PROFILE_SELECT, [userId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({
      success: true,
      data: formatProfileRow(result.rows[0]),
    });
  } catch (err) {
    console.error('[Auth] GET /me error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
});

function readAvatarBody(req, res, next) {
  express.raw({ type: () => true, limit: '2mb' })(req, res, (error) => {
    if (!error) return next();
    if (error.status === 413 || error.type === 'entity.too.large') {
      return res.status(413).json({ success: false, message: 'Photo must be 2 MB or smaller.' });
    }
    return next(error);
  });
}

// GET /api/auth/me/avatar — the signed-in user's profile photo
router.get('/me/avatar', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(`SELECT avatar_file FROM users WHERE id = $1`, [req.currentUser.id]);
    const fileName = result.rows[0]?.avatar_file;
    const file = fileName ? await readAvatarFile(fileName) : null;
    if (!file) return res.status(404).json({ success: false, message: 'No profile photo.' });
    res.set('Content-Type', avatarContentType(fileName));
    res.set('Cache-Control', 'private, no-store');
    return res.status(200).send(file);
  } catch (err) {
    console.error('[Auth] GET /me/avatar error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load profile photo.' });
  }
});

// POST /api/auth/me/avatar — store a JPG, PNG, or WebP for the signed-in user
router.post('/me/avatar', requireAuth, readAvatarBody, async (req, res) => {
  try {
    const detected = detectAvatarImage(req.body);
    if (!detected) {
      return res.status(400).json({
        success: false,
        message: 'Choose a JPG, PNG, or WebP image up to 2 MB.',
      });
    }
    const pool = req.app.locals.pool;
    const userId = req.currentUser.id;
    const fileName = await saveAvatarFile(userId, req.body, detected.ext);
    await pool.query(
      `UPDATE users SET avatar_file = $1, updated_at = NOW() WHERE id = $2`,
      [fileName, userId]
    );
    const result = await pool.query(PROFILE_SELECT, [userId]);
    return res.status(200).json({
      success: true,
      message: 'Profile photo updated.',
      data: formatProfileRow(result.rows[0]),
    });
  } catch (err) {
    console.error('[Auth] POST /me/avatar error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save profile photo.' });
  }
});

// DELETE /api/auth/me/avatar — remove the signed-in user's profile photo
router.delete('/me/avatar', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser.id;
    const current = await pool.query(`SELECT avatar_file FROM users WHERE id = $1`, [userId]);
    if (!current.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    await deleteAvatarFile(current.rows[0].avatar_file);
    await pool.query(`UPDATE users SET avatar_file = NULL, updated_at = NOW() WHERE id = $1`, [userId]);
    const result = await pool.query(PROFILE_SELECT, [userId]);
    return res.status(200).json({
      success: true,
      message: 'Profile photo removed.',
      data: formatProfileRow(result.rows[0]),
    });
  } catch (err) {
    console.error('[Auth] DELETE /me/avatar error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to remove profile photo.' });
  }
});

// PUT /api/auth/me — update own profile (name, email, phone) and/or password
router.put('/me', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser.id;
    const {
      first_name,
      middle_name,
      last_name,
      email,
      phone,
      password,
      new_password,
      confirm_password,
      current_password,
    } = req.body;

    const nextPassword = password ?? new_password;
    const updates = [];
    const params = [];
    let pIdx = 1;
    let changingPassword = false;
    let changingIdentity = false;

    const currentResult = await pool.query(
      `SELECT id, first_name, middle_name, last_name, email, phone, password_hash
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!currentResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const current = currentResult.rows[0];

    if (first_name !== undefined) {
      const value = String(first_name || '').trim();
      if (!value) {
        return res.status(400).json({ success: false, message: 'First name is required.' });
      }
      updates.push(`first_name = $${pIdx++}`);
      params.push(value);
      changingIdentity = true;
    }
    if (middle_name !== undefined) {
      updates.push(`middle_name = $${pIdx++}`);
      params.push(middle_name ? String(middle_name).trim() : null);
      changingIdentity = true;
    }
    if (last_name !== undefined) {
      const value = String(last_name || '').trim();
      if (!value) {
        return res.status(400).json({ success: false, message: 'Last name is required.' });
      }
      updates.push(`last_name = $${pIdx++}`);
      params.push(value);
      changingIdentity = true;
    }
    if (email !== undefined) {
      const value = String(email || '').toLowerCase().trim();
      if (!value || !isValidEmail(value)) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      }
      if (value !== String(current.email || '').toLowerCase()) {
        const dup = await pool.query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1`,
          [value, userId]
        );
        if (dup.rows.length) {
          return res.status(409).json({ success: false, message: 'Email already in use.' });
        }
      }
      updates.push(`email = $${pIdx++}`);
      params.push(value);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${pIdx++}`);
      params.push(phone ? String(phone).trim() : null);
    }

    if (nextPassword !== undefined && nextPassword !== null && String(nextPassword).length > 0) {
      changingPassword = true;
      if (!current_password) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to set a new password.',
        });
      }
      const matches = await bcrypt.compare(String(current_password), current.password_hash);
      if (!matches) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }
      if (String(nextPassword).length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }
      if (confirm_password !== undefined && String(confirm_password) !== String(nextPassword)) {
        return res.status(400).json({ success: false, message: 'New password and confirmation do not match.' });
      }
      const hash = await bcrypt.hash(String(nextPassword), 12);
      updates.push(`password_hash = $${pIdx++}`);
      params.push(hash);
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    if (changingIdentity) {
      const nextFirst = first_name !== undefined ? String(first_name).trim() : current.first_name;
      const nextMiddle = middle_name !== undefined
        ? (middle_name ? String(middle_name).trim() : null)
        : current.middle_name;
      const nextLast = last_name !== undefined ? String(last_name).trim() : current.last_name;
      const fullName = [nextFirst, nextMiddle, nextLast].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      updates.push(`full_name = $${pIdx++}`);
      params.push(fullName || null);
    }

    params.push(userId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`,
      params
    );

    const result = await pool.query(PROFILE_SELECT, [userId]);
    return res.status(200).json({
      success: true,
      message: changingPassword && updates.length === 1
        ? 'Password updated.'
        : changingPassword
          ? 'Profile and password updated.'
          : 'Profile updated.',
      data: formatProfileRow(result.rows[0]),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }
    console.error('[Auth] PUT /me error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

export default router;
