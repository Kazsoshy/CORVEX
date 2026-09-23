/**
 * CORVEX Auth Middleware
 *
 * requireAuth          — verifies a signed session token from Authorization.
 * requireBranchScope   — branch roles may only touch their own branch.
 * requireAssignedBranch — branch roles without a branch are rejected.
 * requireRole          — rejects callers whose role slug is not allowed.
 */

import crypto from 'crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export const UNSCOPED_ROLES = ['super_admin', 'operating_manager'];

export const ROLE_SETS = {
  org: ['super_admin', 'operating_manager'],
  userAdmin: ['super_admin', 'operating_manager'],
  roleAdmin: ['super_admin'],
  catalogRead: ['super_admin', 'operating_manager', 'branch_manager', 'inventory_staff', 'sales_staff'],
  catalogWrite: ['super_admin', 'operating_manager', 'inventory_staff'],
  suppliers: ['super_admin', 'operating_manager', 'inventory_staff'],
  categoriesRead: ['super_admin', 'operating_manager', 'inventory_staff', 'branch_manager', 'sales_staff'],
  categoriesWrite: ['super_admin', 'operating_manager'],
  customerRead: ['super_admin', 'operating_manager', 'branch_manager', 'sales_staff', 'collector'],
  customerWrite: ['super_admin', 'operating_manager', 'branch_manager', 'sales_staff'],
  territoryRead: ['super_admin', 'operating_manager', 'branch_manager', 'sales_staff'],
  territoryWrite: ['super_admin', 'operating_manager', 'branch_manager'],
  reportsBranch: ['super_admin', 'operating_manager', 'branch_manager'],
  reportsOrg: ['super_admin', 'operating_manager'],
  creditHistory: ['super_admin', 'operating_manager', 'branch_manager', 'inventory_staff', 'sales_staff'],
  inventory: ['super_admin', 'operating_manager', 'branch_manager', 'inventory_staff'],
  branchOps: ['super_admin', 'operating_manager', 'branch_manager'],
  receipts: ['super_admin', 'operating_manager'],
  audit: ['super_admin', 'operating_manager'],
  branches: ['super_admin', 'operating_manager', 'branch_manager'],
  dashboardOrg: ['super_admin'],
  dashboardBranches: ['super_admin', 'operating_manager'],
  dashboardBranch: ['super_admin', 'operating_manager', 'branch_manager'],
};

function authSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (!globalThis.__corvexAuthSecret) {
    globalThis.__corvexAuthSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Auth] AUTH_SECRET is not set. Issued sessions end when this process restarts.');
  }
  return globalThis.__corvexAuthSecret;
}

export function issueSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    sub: Number(userId),
    exp: Date.now() + TOKEN_TTL_MS,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSessionToken(header) {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.sub || !data?.exp || Date.now() > Number(data.exp)) return null;
    const userId = Number(data.sub);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null;
  }
}

export function isUnscoped(user) {
  return Boolean(user && UNSCOPED_ROLES.includes(user.roleSlug));
}

export async function requireAuth(req, res, next) {
  if (req.currentUser) return next();

  const userId = readSessionToken(req.headers.authorization);
  if (!userId) {
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
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Authentication required. No valid user session found.' });
    }

    const user = result.rows[0];
    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active.',
      });
    }

    req.currentUser = {
      id: user.id,
      roleSlug: user.role_slug,
      branchId: user.branch_id,
    };
    next();
  } catch (err) {
    console.error('[Auth Middleware] requireAuth error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error during auth.' });
  }
}

export function requireAssignedBranch(req, res, next) {
  const user = req.currentUser;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (isUnscoped(user)) return next();
  if (user.branchId == null) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: no branch is assigned to this account.',
    });
  }
  next();
}

export function requireBranchScope(req, res, next) {
  const user = req.currentUser;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (isUnscoped(user)) return next();
  if (user.branchId == null) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: no branch is assigned to this account.',
    });
  }

  const rawBranchId = req.query.branch_id
    ?? req.body?.branch_id
    ?? req.params.branch_id
    ?? null;
  const requestedBranchId = rawBranchId === null || rawBranchId === '' ? null : Number(rawBranchId);

  if (requestedBranchId !== null && (!Number.isFinite(requestedBranchId) || requestedBranchId !== Number(user.branchId))) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: you can only access data for your assigned branch.',
    });
  }

  if (requestedBranchId === null) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') {
      req.query.branch_id = String(user.branchId);
    } else if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      req.body.branch_id = user.branchId;
    }
  }

  next();
}

export function assertSameBranch(res, user, resourceBranchId) {
  if (isUnscoped(user)) return true;
  if (Number(resourceBranchId) !== Number(user.branchId)) {
    res.status(403).json({
      success: false,
      message: 'Access denied: you can only access data for your assigned branch.',
    });
    return false;
  }
  return true;
}

export function requireRole(allowedRoles) {
  return function roleGuard(req, res, next) {
    const user = req.currentUser;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (!allowedRoles.includes(user.roleSlug)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.',
      });
    }
    next();
  };
}

export function allow(readRoles, writeRoles = readRoles) {
  return function methodGuard(req, res, next) {
    const roles = req.method === 'GET' || req.method === 'HEAD' ? readRoles : writeRoles;
    return requireRole(roles)(req, res, next);
  };
}
