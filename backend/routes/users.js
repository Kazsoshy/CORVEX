import express from 'express';
import bcrypt from 'bcryptjs';
import { requirePermission, requireRole, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import { AUDIT_STATUS, summarizeChanges, writeAuditFromReq } from '../lib/auditLog.js';
import { getUserPermissionMatrix, saveUserPermissions } from '../lib/permissions.js';
import { recordPermissionChangeEvent } from '../lib/security/detectors.js';
import { insertUserNotification } from '../lib/creditInvestigationNotifications.js';
import { generateTemporaryPassword } from '../lib/initialCredentials.js';
import {
  BRANCH_ROLE_SLUGS,
  NON_EMPLOYEE_ROLE_SLUGS,
  DependencyResolutionError,
  listReassignmentCandidates,
  loadUserDependencies,
  resolveUserDependencies,
} from '../lib/userDependencies.js';
import {
  describeMoved,
  disableUserAccount,
  displayName,
  findActiveBranchManager,
  findInactivityCandidates,
  loadBranch,
  loadUserPolicies,
  lockBranchManagerSlot,
  saveUserPolicies,
  validateUserPolicies,
} from '../lib/userAccounts.js';

const router = express.Router();
// Catalog permissions are authoritative (Super Admin always passes via middleware).
router.use(requirePermission(
  'users.view', 'users.create', 'users.edit', 'users.disable', 'users.activate',
  'roles.view', 'roles.assign',
));

const EMAIL_LOCKED_MESSAGE = 'Email address is managed through the account security process and cannot be modified from User Management.';
const PASSWORD_LOCKED_MESSAGE = 'Password management is handled through the secure account recovery process.';

/** Accounts outside an Operating Manager's user management scope. */
const HIDDEN_ROLE_SLUGS = ['super_admin', 'operating_manager', 'customer', 'client'];
const OP_BLOCKED_ROLE_SLUGS = new Set(['super_admin', 'operating_manager', 'client', 'customer']);

function isSuperAdmin(actor) {
  return actor?.roleSlug === 'super_admin';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeContact(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: null };
  const digits = raw.replace(/\D/g, '');
  if (!/^\+?[0-9\s()-]+$/.test(raw) || digits.length < 7 || digits.length > 15) {
    return { error: 'Enter a valid contact number (7–15 digits).' };
  }
  return { value: raw };
}

function cleanName(value, label, { required = true } = {}) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return required ? { error: `${label} is required.` } : { value: null };
  if (text.length > 50) return { error: `${label} must be 50 characters or fewer.` };
  return { value: text };
}

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}

async function loadRole(db, roleId) {
  const result = await db.query(`SELECT role_id, slug, role_name FROM roles WHERE role_id = $1`, [Number(roleId)]);
  return result.rows[0] || null;
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
    COALESCE(u.must_change_password, FALSE) AS must_change_password,
    u.status_reason,
    u.status_changed_at,
    u.login_locked_until,
    TRIM(CONCAT_WS(' ', sc.first_name, sc.last_name)) AS status_changed_by_name,
    r.role_name,
    r.slug AS role_slug,
    b.name AS branch_name
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  LEFT JOIN branches b ON b.id = u.branch_id
  LEFT JOIN users sc ON sc.id = u.status_changed_by
`;

/**
 * Backend visibility rules for user management. Super Admin sees everyone.
 * Everyone else never sees Super Admin, Operating Manager, customer portal
 * accounts, or their own account; branch-scoped callers only see their branch.
 */
function visibilityConditions(actor, startIdx = 1) {
  const conditions = [];
  const params = [];
  let pIdx = startIdx;
  if (!isSuperAdmin(actor)) {
    conditions.push(`r.slug <> ALL($${pIdx++}::text[])`);
    params.push(HIDDEN_ROLE_SLUGS);
    conditions.push(`u.id <> $${pIdx++}`);
    params.push(Number(actor?.id) || 0);
  }
  if (!isUnscoped(actor)) {
    conditions.push(`u.branch_id = $${pIdx++}`);
    params.push(actor?.branchId ?? -1);
  }
  return { conditions, params, nextIdx: pIdx };
}

async function loadManagedUser(db, actor, userId, { forUpdate = false } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const vis = visibilityConditions(actor, 2);
  const where = ['u.id = $1', ...vis.conditions].join(' AND ');
  const result = await db.query(
    `${USER_SELECT} WHERE ${where}${forUpdate ? ' FOR UPDATE OF u' : ''}`,
    [id, ...vis.params]
  );
  return result.rows[0] || null;
}

function asDependencyUser(row) {
  return { id: row.user_id, role_id: row.role_id, role_slug: row.role_slug, branch_id: row.branch_id };
}

function sendDependencyError(res, err) {
  return res.status(err.status || 409).json({
    success: false,
    code: 'OPEN_RESPONSIBILITIES',
    message: err.message,
    ...err.payload,
  });
}

/** Branch requirement + Branch Manager slot validation for a role/branch pair. */
async function validateRoleBranch(db, { roleSlug, branchId, userId = null, willBeActive = true }) {
  if (!BRANCH_ROLE_SLUGS.has(roleSlug)) return { branchId: null };
  if (!branchId) return { error: 'Select the branch this employee works in.', status: 400 };
  const branch = await loadBranch(db, branchId);
  if (!branch) return { error: 'Selected branch was not found.', status: 400 };
  if (willBeActive && branch.status && branch.status !== 'Active') {
    return { error: `${branch.name} is not active. Choose an active branch.`, status: 400 };
  }
  if (roleSlug === 'branch_manager' && willBeActive) {
    await lockBranchManagerSlot(db, branch.id);
    const existing = await findActiveBranchManager(db, branch.id, userId);
    if (existing) {
      return {
        status: 409,
        code: 'BRANCH_MANAGER_EXISTS',
        error: `${branch.name} already has an active Branch Manager: ${displayName(existing)}${existing.employee_id ? ` (${existing.employee_id})` : ''}. Disable or reassign them first.`,
      };
    }
  }
  return { branchId: branch.id, branch };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users
// Query: role (slug), status, branch_id, search, sort, order, page, limit
// ──────────────────────────────────────────────────────────────────────────────
const SORT_COLUMNS = {
  employee_id: 'u.employee_id',
  name: `LOWER(CONCAT_WS(' ', u.first_name, u.last_name))`,
  role: 'r.role_name',
  branch: 'b.name',
  created_at: 'u.created_at',
  status: 'u.status',
};

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const actor = req.currentUser;
    const { role, status, branch_id, search, sort, order } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 500);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const vis = visibilityConditions(actor, 1);
    const conditions = [...vis.conditions];
    const params = [...vis.params];
    let pIdx = vis.nextIdx;

    if (branch_id && isUnscoped(actor)) {
      conditions.push(`u.branch_id = $${pIdx++}`);
      params.push(Number(branch_id));
    }
    if (role) {
      conditions.push(`r.slug = $${pIdx++}`);
      params.push(String(role));
    }
    if (status && ['Active', 'Inactive'].includes(String(status))) {
      conditions.push(`u.status = $${pIdx++}`);
      params.push(String(status));
    }
    if (search && String(search).trim()) {
      conditions.push(`(
        CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) ILIKE $${pIdx}
        OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $${pIdx}
        OR u.email ILIKE $${pIdx}
        OR u.employee_id ILIKE $${pIdx}
      )`);
      params.push(`%${String(search).trim()}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = SORT_COLUMNS[sort] || SORT_COLUMNS.created_at;
    const direction = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users u JOIN roles r ON r.role_id = u.role_id LEFT JOIN branches b ON b.id = u.branch_id ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const result = await pool.query(
      `${USER_SELECT}
       ${where}
       ORDER BY ${sortColumn} ${direction} NULLS LAST, u.id ${direction}
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map(formatUser),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[Users] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle policies (Operating Manager / Super Admin)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/policies', requireRole(ROLE_SETS.userAdmin), async (req, res) => {
  try {
    const policies = await loadUserPolicies(req.app.locals.pool);
    return res.status(200).json({ success: true, data: policies });
  } catch (err) {
    console.error('[Users] GET /policies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load user policies.' });
  }
});

router.put('/policies', requireRole(ROLE_SETS.userAdmin), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { policies, error } = validateUserPolicies(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const before = await loadUserPolicies(pool);
    await saveUserPolicies(pool, policies);
    await writeAuditFromReq(pool, req, {
      module: 'User Management',
      activity: 'Update User Policies',
      action: 'Update User Policies',
      description: `Inactivity policy: ${summarizeChanges(before.inactivity, policies.inactivity) || 'no changes'}.`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: 'system_settings:user_policies',
    });
    return res.status(200).json({ success: true, message: 'User policies saved.', data: policies });
  } catch (err) {
    console.error('[Users] PUT /policies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save user policies.' });
  }
});

router.get('/policies/inactivity-preview', requireRole(ROLE_SETS.userAdmin), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const saved = await loadUserPolicies(pool);
    const days = req.query.days !== undefined ? Number(req.query.days) : saved.inactivity.inactivityDays;
    const includeNeverSignedIn = req.query.include_never_signed_in !== undefined
      ? String(req.query.include_never_signed_in) === 'true'
      : saved.inactivity.includeNeverSignedIn;
    if (!Number.isInteger(days) || days <= 0) {
      return res.status(200).json({ success: true, data: { inactivityDays: null, candidates: [] } });
    }
    const rows = await findInactivityCandidates(pool, {
      inactivity: { ...saved.inactivity, inactivityDays: days, includeNeverSignedIn },
    });
    return res.status(200).json({
      success: true,
      data: {
        inactivityDays: days,
        candidates: rows.map((row) => ({
          id: row.id,
          employeeId: row.employee_id || null,
          name: displayName(row),
          role: row.role_name,
          branch: row.branch_name || null,
          lastLogin: row.last_login || null,
          daysInactive: row.days_inactive,
          openWork: row.dependencies.items.reduce((sum, item) => sum + item.count, 0),
        })),
      },
    });
  } catch (err) {
    console.error('[Users] GET /policies/inactivity-preview error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to preview inactive accounts.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/branch-manager-slots — which branches already have an active BM
// ──────────────────────────────────────────────────────────────────────────────
router.get('/branch-manager-slots', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      `SELECT b.id, b.name, b.status,
              m.id AS manager_id, m.employee_id AS manager_employee_id,
              m.first_name AS manager_first_name, m.middle_name AS manager_middle_name, m.last_name AS manager_last_name
         FROM branches b
         LEFT JOIN LATERAL (
           SELECT u.id, u.employee_id, u.first_name, u.middle_name, u.last_name
             FROM users u JOIN roles r ON r.role_id = u.role_id
            WHERE r.slug = 'branch_manager' AND u.status = 'Active' AND u.branch_id = b.id
            ORDER BY u.id
            LIMIT 1
         ) m ON TRUE
        ORDER BY b.name`
    );
    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        branchId: row.id,
        branchName: row.name,
        branchStatus: row.status,
        manager: row.manager_id ? {
          id: row.manager_id,
          employeeId: row.manager_employee_id || null,
          name: [row.manager_first_name, row.manager_middle_name, row.manager_last_name].filter(Boolean).join(' '),
        } : null,
      })),
    });
  } catch (err) {
    console.error('[Users] GET /branch-manager-slots error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load branch manager assignments.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id/permissions — Full catalog + selected user's grants
// ──────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id/permissions',
  requirePermission('roles.view', 'roles.assign'),
  async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid user id.' });
      }

      const userResult = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const matrix = await getUserPermissionMatrix(pool, userId);
      if (!matrix) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      return res.status(200).json({
        success: true,
        data: {
          user: formatUser(userResult.rows[0]),
          locked: matrix.locked,
          hasCustomPermissions: matrix.hasCustomPermissions,
          permissions: matrix.permissions,
          modules: matrix.modules,
        },
      });
    } catch (err) {
      console.error('[Users] GET /:id/permissions error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch user permissions.' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id/permissions — Save selected user's permission grants
// Body: { permissions: { [permission_id]: boolean } }
// ──────────────────────────────────────────────────────────────────────────────
router.put(
  '/:id/permissions',
  requirePermission('roles.assign'),
  async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      const userId = Number(req.params.id);
      const { permissions } = req.body || {};

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid user id.' });
      }
      if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
        return res.status(400).json({ success: false, message: 'permissions object is required.' });
      }

      const matrix = await saveUserPermissions(pool, userId, permissions);

      try {
        await recordPermissionChangeEvent(pool, {
          actorId: req.currentUser?.id || null,
          actorName: req.currentUser?.fullName || req.currentUser?.email || 'Administrator',
          roleId: matrix.user.role_id,
          roleName: `${matrix.user.role_name} (user #${userId})`,
          roleSlug: matrix.user.role_slug,
          changedPermissions: permissions,
          sourceIp: req.ip || null,
        });
      } catch (secErr) {
        console.error('[Users] security permission monitor:', secErr.message);
      }

      await writeAuditFromReq(pool, req, {
        module: 'Roles and Permissions',
        activity: 'Update User Permissions',
        action: 'Update User Permissions',
        description: `Updated permissions for user #${userId}.`,
        status: AUDIT_STATUS.UPDATED,
        affectedRecord: `user:${userId}`,
      });

      const userResult = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [userId]);
      return res.status(200).json({
        success: true,
        message: 'User permissions updated successfully.',
        data: {
          user: formatUser(userResult.rows[0]),
          locked: matrix.locked,
          hasCustomPermissions: matrix.hasCustomPermissions,
          permissions: matrix.permissions,
          modules: matrix.modules,
        },
      });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[Users] PUT /:id/permissions error:', err.message);
      return res.status(status).json({
        success: false,
        message: err.status ? err.message : 'Failed to update user permissions.',
      });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const row = await loadManagedUser(req.app.locals.pool, req.currentUser, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.status(200).json({ success: true, data: formatUser(row) });
  } catch (err) {
    console.error('[Users] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id/dependencies — open work + eligible replacements
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id/dependencies', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const row = await loadManagedUser(pool, req.currentUser, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'User not found.' });
    const depUser = asDependencyUser(row);
    const [dependencies, candidates] = await Promise.all([
      loadUserDependencies(pool, depUser),
      listReassignmentCandidates(pool, depUser),
    ]);
    return res.status(200).json({
      success: true,
      data: { user: formatUser(row), dependencies, candidates },
    });
  } catch (err) {
    console.error('[Users] GET /:id/dependencies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to check open responsibilities.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/users — Create employee account (always Active, temporary password)
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', requirePermission('users.create'), async (req, res) => {
  const pool = req.app.locals.pool;
  const actor = req.currentUser;
  const body = req.body || {};
  const client = await pool.connect();
  try {
    const first = cleanName(body.first_name, 'First name');
    const middle = cleanName(body.middle_name, 'Middle name', { required: false });
    const last = cleanName(body.last_name, 'Last name');
    const contact = normalizeContact(body.contact_number ?? body.phone);
    const fieldError = first.error || middle.error || last.error || contact.error;
    if (fieldError) return res.status(400).json({ success: false, message: fieldError });

    const email = String(body.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!body.role_id) return res.status(400).json({ success: false, message: 'Select a role.' });

    const role = await loadRole(pool, body.role_id);
    if (!role) return res.status(400).json({ success: false, message: 'Role not found.' });
    if (NON_EMPLOYEE_ROLE_SLUGS.has(role.slug)) {
      return res.status(400).json({
        success: false,
        message: 'Customer portal accounts are created from the customer record, not User Management.',
      });
    }
    if (role.slug === 'super_admin' && !isSuperAdmin(actor)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (actor.roleSlug === 'operating_manager' && OP_BLOCKED_ROLE_SLUGS.has(role.slug)) {
      return res.status(403).json({
        success: false,
        message: 'Operating Managers cannot create Super Admin or Operating Manager accounts.',
      });
    }

    // Super Admin may still set an initial password; it is forced to change on first sign-in either way.
    const suppliedPassword = isSuperAdmin(actor) && body.password ? String(body.password) : null;
    if (suppliedPassword && suppliedPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    const temporaryPassword = suppliedPassword ? null : generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(suppliedPassword || temporaryPassword, 12);

    await client.query('BEGIN');

    const roleBranch = await validateRoleBranch(client, { roleSlug: role.slug, branchId: body.branch_id });
    if (roleBranch.error) {
      await client.query('ROLLBACK');
      return res.status(roleBranch.status || 400).json({
        success: false,
        code: roleBranch.code,
        message: roleBranch.error,
      });
    }

    const dup = await client.query(`SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1`, [email]);
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        code: 'EMAIL_IN_USE',
        message: 'An account with this email already exists (including disabled accounts).',
      });
    }

    const fullName = [first.value, middle.value, last.value].filter(Boolean).join(' ');
    const inserted = await client.query(
      `INSERT INTO users
         (first_name, middle_name, last_name, full_name, email, username, password_hash,
          role_id, branch_id, status, phone, contact_number,
          must_change_password, status_changed_at, status_changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Active',$10,$10, TRUE, NOW(), $11)
       RETURNING id, employee_id`,
      [
        first.value,
        middle.value,
        last.value,
        fullName,
        email,
        isSuperAdmin(actor) && body.username ? String(body.username).trim() : null,
        passwordHash,
        role.role_id,
        roleBranch.branchId,
        contact.value,
        actor.id,
      ]
    );
    const newId = inserted.rows[0].id;
    if (role.slug === 'branch_manager') {
      await client.query(`UPDATE branches SET manager_id = $1, updated_at = NOW() WHERE id = $2`, [newId, roleBranch.branchId]);
    }
    await client.query('COMMIT');

    const created = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [newId]);
    const row = created.rows[0];

    await writeAuditFromReq(pool, req, {
      module: 'User Management',
      activity: 'Create User',
      action: 'Create User',
      description: `Created ${row.role_name} account ${fullName} (${row.employee_id || `user #${newId}`}, ${email})${row.branch_name ? ` for ${row.branch_name}` : ''}. Status: Active. A temporary password was issued; change required at first sign-in.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `user:${newId}`,
      branchId: row.branch_id,
    });

    noStore(res);
    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: formatUser(row),
      initialCredential: {
        mustChangePassword: true,
        ...(temporaryPassword ? { temporaryPassword } : {}),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'An account with this email or username already exists.' });
    }
    console.error('[Users] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create user.' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id — Edit profile and organizational assignment.
// Status, Employee ID, email, and password are not editable here.
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', requirePermission('users.edit'), async (req, res) => {
  const pool = req.app.locals.pool;
  const actor = req.currentUser;
  const body = req.body || {};
  const sa = isSuperAdmin(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await loadManagedUser(client, actor, req.params.id, { forUpdate: true });
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const fail = async (status, message, extra = {}) => {
      await client.query('ROLLBACK');
      return res.status(status).json({ success: false, message, ...extra });
    };

    if (body.status !== undefined && String(body.status) !== String(target.status)) {
      return fail(400, 'Account status cannot be changed from Edit User. Use Disable or Enable from the actions menu.');
    }
    if (body.employee_id !== undefined && (body.employee_id || null) !== (target.employee_id || null)) {
      return fail(400, 'Employee ID is system-generated and cannot be changed.');
    }

    const emailInput = body.email !== undefined ? String(body.email || '').trim().toLowerCase() : null;
    const emailChanging = emailInput !== null && emailInput !== String(target.email || '').toLowerCase();
    if (emailChanging && !sa) return fail(400, EMAIL_LOCKED_MESSAGE, { code: 'EMAIL_LOCKED' });
    const passwordChanging = body.password !== undefined && body.password !== null && String(body.password).length > 0;
    if (passwordChanging && !sa) return fail(400, PASSWORD_LOCKED_MESSAGE, { code: 'PASSWORD_LOCKED' });

    const updates = [];
    const params = [];
    let pIdx = 1;
    const set = (column, value) => {
      updates.push(`${column} = $${pIdx++}`);
      params.push(value);
    };

    const nextNames = {
      first_name: target.first_name,
      middle_name: target.middle_name,
      last_name: target.last_name,
    };
    if (body.first_name !== undefined) {
      const v = cleanName(body.first_name, 'First name');
      if (v.error) return fail(400, v.error);
      nextNames.first_name = v.value;
      set('first_name', v.value);
    }
    if (body.middle_name !== undefined) {
      const v = cleanName(body.middle_name, 'Middle name', { required: false });
      if (v.error) return fail(400, v.error);
      nextNames.middle_name = v.value;
      set('middle_name', v.value);
    }
    if (body.last_name !== undefined) {
      const v = cleanName(body.last_name, 'Last name');
      if (v.error) return fail(400, v.error);
      nextNames.last_name = v.value;
      set('last_name', v.value);
    }
    if (body.contact_number !== undefined || body.phone !== undefined) {
      const v = normalizeContact(body.contact_number ?? body.phone);
      if (v.error) return fail(400, v.error);
      set('phone', v.value);
      set('contact_number', v.value);
    }
    if (sa && body.username !== undefined) {
      set('username', body.username ? String(body.username).trim() : null);
    }

    // Role / branch change
    let nextRole = { role_id: target.role_id, slug: target.role_slug, role_name: target.role_name };
    if (body.role_id !== undefined && body.role_id !== null && body.role_id !== '') {
      const role = await loadRole(client, body.role_id);
      if (!role) return fail(400, 'Role not found.');
      nextRole = role;
    }
    const roleChanged = Number(nextRole.role_id) !== Number(target.role_id);
    if (roleChanged) {
      if (NON_EMPLOYEE_ROLE_SLUGS.has(nextRole.slug)) return fail(400, 'Employees cannot be converted into customer accounts.');
      if (nextRole.slug === 'super_admin' && !sa) return fail(403, 'Access denied.');
      if (actor.roleSlug === 'operating_manager' && OP_BLOCKED_ROLE_SLUGS.has(nextRole.slug)) {
        return fail(403, 'Operating Managers cannot assign the Super Admin or Operating Manager role.');
      }
    }
    const requestedBranch = body.branch_id !== undefined
      ? (body.branch_id ? Number(body.branch_id) : null)
      : target.branch_id;
    const isActive = target.status === 'Active';
    const assignmentTouched = roleChanged || Number(requestedBranch || 0) !== Number(target.branch_id || 0);
    let roleBranch = { branchId: target.branch_id };
    if (assignmentTouched) {
      roleBranch = await validateRoleBranch(client, {
        roleSlug: nextRole.slug,
        branchId: requestedBranch,
        userId: target.user_id,
        willBeActive: isActive,
      });
      if (roleBranch.error) return fail(roleBranch.status || 400, roleBranch.error, { code: roleBranch.code });
    }
    const branchChanged = Number(roleBranch.branchId || 0) !== Number(target.branch_id || 0);

    let resolution = null;
    if ((roleChanged || branchChanged) && isActive) {
      resolution = await resolveUserDependencies(client, asDependencyUser(target), {
        reassignToUserId: body.reassign_to_user_id || null,
        acknowledgeHandover: Boolean(body.acknowledge_handover),
      });
    }
    if (roleChanged) set('role_id', nextRole.role_id);
    if (branchChanged) set('branch_id', roleBranch.branchId);

    if (emailChanging) {
      if (!isValidEmail(emailInput)) return fail(400, 'Enter a valid email address.');
      const dup = await client.query(`SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2`, [emailInput, target.user_id]);
      if (dup.rows.length) return fail(409, 'An account with this email already exists (including disabled accounts).');
      set('email', emailInput);
    }
    if (passwordChanging) {
      if (String(body.password).length < 8) return fail(400, 'Password must be at least 8 characters.');
      set('password_hash', await bcrypt.hash(String(body.password), 12));
      updates.push('must_change_password = TRUE');
    }
    const unlockLogin = Boolean(body.unlock_login)
      && target.login_locked_until && new Date(target.login_locked_until).getTime() > Date.now();
    if (unlockLogin) {
      updates.push('failed_login_count = 0');
      updates.push('login_locked_until = NULL');
    }
    if (roleChanged || branchChanged || emailChanging || passwordChanging) {
      updates.push('session_revoked_at = NOW()');
    }

    if (!updates.length) return fail(400, 'No changes to save.');

    set('full_name', [nextNames.first_name, nextNames.middle_name, nextNames.last_name].filter(Boolean).join(' '));
    params.push(target.user_id);
    await client.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`, params);

    if ((roleChanged || branchChanged) && target.role_slug === 'branch_manager') {
      await client.query(`UPDATE branches SET manager_id = NULL, updated_at = NOW() WHERE manager_id = $1`, [target.user_id]);
    }
    if ((roleChanged || branchChanged) && nextRole.slug === 'branch_manager' && isActive) {
      await client.query(`UPDATE branches SET manager_id = $1, updated_at = NOW() WHERE id = $2`, [target.user_id, roleBranch.branchId]);
    }
    await client.query('COMMIT');

    const updated = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [target.user_id]);
    const after = updated.rows[0];
    const label = `${displayName(after)} (${after.employee_id || `user #${after.user_id}`})`;
    const changeSummary = summarizeChanges(
      {
        first_name: target.first_name,
        middle_name: target.middle_name,
        last_name: target.last_name,
        contact: target.contact_number || target.phone,
        role: target.role_name,
        branch: target.branch_name,
      },
      {
        first_name: after.first_name,
        middle_name: after.middle_name,
        last_name: after.last_name,
        contact: after.contact_number || after.phone,
        role: after.role_name,
        branch: after.branch_name,
      }
    );

    await writeAuditFromReq(pool, req, {
      module: 'User Management',
      activity: roleChanged || branchChanged ? 'Reassign User Role/Branch' : 'Edit User',
      action: 'Edit User',
      description: `Edited ${label}.${changeSummary ? ` Changes: ${changeSummary}.` : ''}${resolution ? ` Open work moved: ${describeMoved(resolution.moved)}${resolution.target ? ` to ${resolution.target.name}` : ''}.` : ''}${roleChanged || branchChanged ? ' Existing sessions ended.' : ''}`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `user:${after.user_id}`,
      branchId: after.branch_id,
    });
    if (emailChanging) {
      await writeAuditFromReq(pool, req, {
        module: 'User Management',
        activity: 'Email Changed (Administrative Override)',
        action: 'Email Changed',
        description: `Super Admin changed the sign-in email for ${label} from ${target.email} to ${after.email}. Existing sessions ended.`,
        status: AUDIT_STATUS.UPDATED,
        affectedRecord: `user:${after.user_id}`,
      });
    }
    if (passwordChanging) {
      await writeAuditFromReq(pool, req, {
        module: 'User Management',
        activity: 'Reset User Password',
        action: 'Password Reset',
        description: `Super Admin set a new password for ${label}. Change required at next sign-in; existing sessions ended.`,
        status: AUDIT_STATUS.PASSWORD_RESET,
        affectedRecord: `user:${after.user_id}`,
      });
    }
    if (unlockLogin) {
      await writeAuditFromReq(pool, req, {
        module: 'User Management',
        activity: 'Account Unlocked',
        action: 'Account Unlocked',
        description: `Unlocked login lockout for ${label}.`,
        status: AUDIT_STATUS.ACCOUNT_UNLOCKED,
        affectedRecord: `user:${after.user_id}`,
      });
    }
    if (resolution?.target && Object.values(resolution.moved).some((n) => n > 0)) {
      await insertUserNotification(pool, {
        userId: resolution.target.id,
        title: 'Work reassigned to you',
        message: `Open work from ${displayName(target)} was reassigned to you after a role or branch change.`,
        category: 'Assignment',
      });
    }

    return res.status(200).json({ success: true, message: 'User updated successfully.', data: formatUser(after) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof DependencyResolutionError) return sendDependencyError(res, err);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'An account with this email or username already exists.' });
    }
    console.error('[Users] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Disable (soft): POST /api/users/:id/disable  { reason, reassign_to_user_id?, acknowledge_handover? }
// DELETE /api/users/:id is kept as an alias for existing Super Admin screens.
// ──────────────────────────────────────────────────────────────────────────────
async function handleDisable(req, res, { requireReason }) {
  const pool = req.app.locals.pool;
  const actor = req.currentUser;
  const body = req.body || {};
  const reason = String(body.reason || '').trim();
  if (requireReason && reason.length < 5) {
    return res.status(400).json({ success: false, message: 'Enter a reason for disabling this account (at least 5 characters).' });
  }
  if (reason.length > 500) {
    return res.status(400).json({ success: false, message: 'Reason must be 500 characters or fewer.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await loadManagedUser(client, actor, req.params.id, { forUpdate: true });
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const fail = async (status, message) => {
      await client.query('ROLLBACK');
      return res.status(status).json({ success: false, message });
    };
    if (Number(target.user_id) === Number(actor.id)) return fail(400, 'You cannot disable your own account.');
    if (target.status !== 'Active') return fail(400, 'This account is already disabled.');
    if (target.role_slug === 'super_admin') {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS n FROM users u JOIN roles r ON r.role_id = u.role_id
          WHERE r.slug = 'super_admin' AND u.status = 'Active'`
      );
      if (Number(admins.rows[0]?.n) <= 1) return fail(400, 'Cannot disable the last active Super Admin account.');
    }

    const resolution = await disableUserAccount(client, asDependencyUser(target), {
      actorId: actor.id,
      reason: reason || 'Disabled by administrator.',
      reassignToUserId: body.reassign_to_user_id || null,
      acknowledgeHandover: Boolean(body.acknowledge_handover),
    });
    await client.query('COMMIT');

    const label = `${displayName(target)} (${target.employee_id || `user #${target.user_id}`})`;
    await writeAuditFromReq(pool, req, {
      module: 'User Management',
      activity: 'Disable User',
      action: 'Deactivate User',
      description: `Disabled ${target.role_name} ${label}${target.branch_name ? `, ${target.branch_name}` : ''}. Reason: ${reason || 'Disabled by administrator.'} Open work moved: ${describeMoved(resolution.moved)}${resolution.target ? ` to ${resolution.target.name}` : ''}. Sign-in blocked and all sessions ended; records preserved.`,
      status: AUDIT_STATUS.ARCHIVED,
      affectedRecord: `user:${target.user_id}`,
      branchId: target.branch_id,
    });
    if (resolution.target && Object.values(resolution.moved).some((n) => n > 0)) {
      await insertUserNotification(pool, {
        userId: resolution.target.id,
        title: 'Work reassigned to you',
        message: `Open work from ${displayName(target)} was reassigned to you because their account was disabled.`,
        category: 'Assignment',
      });
    }

    const updated = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [target.user_id]);
    return res.status(200).json({
      success: true,
      message: 'Account disabled. Sign-in is blocked and active sessions were ended. Records are preserved.',
      data: formatUser(updated.rows[0]),
      moved: resolution.moved,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof DependencyResolutionError) return sendDependencyError(res, err);
    console.error('[Users] disable error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to disable user.' });
  } finally {
    client.release();
  }
}

router.post('/:id/disable', requirePermission('users.disable'), (req, res) => handleDisable(req, res, { requireReason: true }));
router.delete('/:id', requirePermission('users.disable'), (req, res) => handleDisable(req, res, { requireReason: false }));

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/users/:id/enable  { reason? }
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/enable', requirePermission('users.activate'), async (req, res) => {
  const pool = req.app.locals.pool;
  const actor = req.currentUser;
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await loadManagedUser(client, actor, req.params.id, { forUpdate: true });
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (target.status === 'Active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'This account is already active.' });
    }
    const roleBranch = await validateRoleBranch(client, {
      roleSlug: target.role_slug,
      branchId: target.branch_id,
      userId: target.user_id,
    });
    if (roleBranch.error) {
      await client.query('ROLLBACK');
      return res.status(roleBranch.status || 400).json({ success: false, code: roleBranch.code, message: roleBranch.error });
    }

    await client.query(
      `UPDATE users
          SET status = 'Active',
              status_reason = $2,
              status_changed_at = NOW(),
              status_changed_by = $3,
              failed_login_count = 0,
              login_locked_until = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [target.user_id, reason || null, actor.id]
    );
    if (target.role_slug === 'branch_manager') {
      await client.query(`UPDATE branches SET manager_id = $1, updated_at = NOW() WHERE id = $2`, [target.user_id, target.branch_id]);
    }
    await client.query('COMMIT');

    await writeAuditFromReq(pool, req, {
      module: 'User Management',
      activity: 'Enable User',
      action: 'Activate User',
      description: `Re-enabled ${target.role_name} ${displayName(target)} (${target.employee_id || `user #${target.user_id}`}).${reason ? ` Reason: ${reason}` : ''} Previous disable reason: ${target.status_reason || '—'}.`,
      status: AUDIT_STATUS.RESTORED,
      affectedRecord: `user:${target.user_id}`,
      branchId: target.branch_id,
    });

    const updated = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [target.user_id]);
    return res.status(200).json({
      success: true,
      message: 'Account enabled. The employee can sign in again with their existing role.',
      data: formatUser(updated.rows[0]),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Users] enable error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to enable user.' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/users/:id/temporary-password  { reason }
// Account recovery: issue a one-time temporary password (shown once), force a
// change at next sign-in, and end existing sessions.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/temporary-password', requirePermission('users.edit'), async (req, res) => {
  const pool = req.app.locals.pool;
  const actor = req.currentUser;
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ success: false, message: 'Enter a reason for issuing a temporary password (5–500 characters).' });
  }
  try {
    const target = await loadManagedUser(pool, actor, req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });
    if (Number(target.user_id) === Number(actor.id)) {
      return res.status(400).json({ success: false, message: 'Change your own password from your profile.' });
    }
    if (target.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Enable this account before issuing a temporary password.' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const hash = await bcrypt.hash(temporaryPassword, 12);
    await pool.query(
      `UPDATE users
          SET password_hash = $2,
              must_change_password = TRUE,
              session_revoked_at = NOW(),
              failed_login_count = 0,
              login_locked_until = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [target.user_id, hash]
    );

    await writeAuditFromReq(pool, req, {
      module: 'User Management',
      activity: 'Temporary Password Issued',
      action: 'Password Reset',
      description: `Issued a temporary password for ${displayName(target)} (${target.employee_id || `user #${target.user_id}`}). Reason: ${reason}. Change required at next sign-in; existing sessions ended.`,
      status: AUDIT_STATUS.PASSWORD_RESET,
      affectedRecord: `user:${target.user_id}`,
      branchId: target.branch_id,
    });

    noStore(res);
    return res.status(200).json({
      success: true,
      message: 'Temporary password issued. It will not be shown again.',
      initialCredential: { temporaryPassword, mustChangePassword: true },
    });
  } catch (err) {
    console.error('[Users] temporary-password error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to issue a temporary password.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helper: format user row for response (never includes password data)
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
    status_reason: row.status_reason || null,
    status_changed_at: row.status_changed_at || null,
    status_changed_by_name: row.status_changed_by_name || null,
    must_change_password: Boolean(row.must_change_password),
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
