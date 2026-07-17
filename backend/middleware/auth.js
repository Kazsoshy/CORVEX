/**
 * CORVEX Auth Middleware
 *
 * requireAuth     — verifies the caller is a known, active user by reading
 *                   X-User-Id from the request header (set by the frontend
 *                   apiClient from localStorage). Attaches req.currentUser.
 *
 * requireBranchScope — for branch-scoped routes, ensures the requesting user
 *                   either (a) has no branch restriction (Operating Manager /
 *                   Super Admin), or (b) is accessing data that belongs to
 *                   their own branch_id. Rejects cross-branch access with 403.
 *
 * requireRole     — rejects any caller whose role slug is not in the allowed
 *                   list.
 *
 * Usage in routes:
 *   router.get('/something', requireAuth, requireBranchScope, handler);
 *   router.post('/admin-only', requireAuth, requireRole(['super_admin','operating_manager']), handler);
 */

import pkg from 'pg';
const { Pool } = pkg;

// ─── requireAuth ─────────────────────────────────────────────────────────────
/**
 * Reads X-User-Id header, looks up the user in the DB, and attaches
 * req.currentUser = { id, role_slug, branch_id }.
 * Returns 401 if the header is missing or the user is not found/active.
 */
export async function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'];

  if (!userId || isNaN(Number(userId))) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. No valid user session found.',
    });
  }

  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      `SELECT u.id, u.status, u.branch_id,
              r.slug AS role_slug
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [Number(userId)]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const user = result.rows[0];

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active.',
      });
    }

    req.currentUser = {
      id:        user.id,
      roleSlug:  user.role_slug,
      branchId:  user.branch_id,   // null for OM / Super Admin
    };

    next();
  } catch (err) {
    console.error('[Auth Middleware] requireAuth error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error during auth.' });
  }
}

// ─── requireBranchScope ──────────────────────────────────────────────────────
/**
 * Must run AFTER requireAuth (needs req.currentUser).
 *
 * Roles with no branch restriction (null branch_id): super_admin, operating_manager
 * — these pass through unconditionally.
 *
 * All other roles (including branch_manager) must only access data for their
 * own branch. The target branch_id is read from:
 *   1. req.query.branch_id
 *   2. req.body.branch_id
 *   3. req.params.branch_id
 * in that priority order.
 *
 * If the caller is a branch-scoped role and no branch_id param is present,
 * this middleware automatically injects their branch_id so downstream handlers
 * always operate on the correct branch without additional checks.
 */
export function requireBranchScope(req, res, next) {
  const user = req.currentUser;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  // Roles that see all branches — let through unmodified
  const UNSCOPED_ROLES = ['super_admin', 'operating_manager'];
  if (UNSCOPED_ROLES.includes(user.roleSlug) || user.branchId === null) {
    return next();
  }

  // Branch-scoped role: determine requested branch
  const requestedBranchId =
    req.query.branch_id   ? Number(req.query.branch_id) :
    req.body?.branch_id   ? Number(req.body.branch_id)  :
    req.params.branch_id  ? Number(req.params.branch_id) :
    null;

  if (requestedBranchId !== null && requestedBranchId !== user.branchId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: you can only access data for your assigned branch.',
    });
  }

  // Auto-inject branch_id so downstream handlers don't need to check
  if (requestedBranchId === null) {
    req.query.branch_id = String(user.branchId);
  }

  next();
}

// ─── requireRole ─────────────────────────────────────────────────────────────
/**
 * Factory — returns middleware that allows only the listed role slugs.
 * @param {string[]} allowedRoles
 */
export function requireRole(allowedRoles) {
  return function (req, res, next) {
    const user = req.currentUser;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (!allowedRoles.includes(user.roleSlug)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: this action requires one of [${allowedRoles.join(', ')}].`,
      });
    }
    next();
  };
}
