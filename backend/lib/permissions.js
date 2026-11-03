/**
 * CORVEX permission catalog helpers and effective-grant resolution.
 *
 * Effective permission for a user:
 *   1. Super Admin → all active catalog permissions granted
 *   2. If the user has any rows in user_permissions → those rows are authoritative
 *   3. Otherwise → inherit from role_permissions
 */

export const MODULE_ORDER = [
  'Dashboard',
  'Users',
  'Role & Permissions',
  'System Settings',
  'Backup & Restore',
  'Database Monitoring',
  'Security Monitoring',
  'Audit Logs',
  'Notifications',
];

/** Manage / action codes that require the module view code. */
export const MANAGE_IMPLIES_VIEW = {
  'users.create': 'users.view',
  'users.edit': 'users.view',
  'users.disable': 'users.view',
  'users.activate': 'users.view',
  'roles.create': 'roles.view',
  'roles.edit': 'roles.view',
  'roles.delete': 'roles.view',
  'roles.assign': 'roles.view',
  'settings.update': 'settings.view',
  'backup.create': 'backup.view',
  'backup.restore': 'backup.view',
  'backup.download': 'backup.view',
  'monitoring.details': 'monitoring.view',
  'security.events': 'security.view',
  'security.manage': 'security.view',
  'audit.details': 'audit.view',
  'notifications.manage': 'notifications.view',
};

export function applyManageImpliesView(codes) {
  const set = codes instanceof Set ? new Set(codes) : new Set(codes || []);
  for (const [manageCode, viewCode] of Object.entries(MANAGE_IMPLIES_VIEW)) {
    if (set.has(manageCode)) set.add(viewCode);
  }
  return set;
}

/**
 * Given a permission_id → granted map and catalog rows, ensure manage grants
 * also grant their module view permission.
 */
export function expandGrantsWithView(grantsById, catalog) {
  const byCode = new Map(catalog.map((p) => [p.code, Number(p.permission_id)]));
  const next = { ...grantsById };
  for (const [manageCode, viewCode] of Object.entries(MANAGE_IMPLIES_VIEW)) {
    const manageId = byCode.get(manageCode);
    const viewId = byCode.get(viewCode);
    if (manageId == null || viewId == null) continue;
    if (next[manageId] || next[String(manageId)]) {
      next[viewId] = true;
      next[String(viewId)] = true;
    }
  }
  return next;
}

const CATALOG_SQL = `
  SELECT permission_id, label, description, module, code,
         COALESCE(status, 'Active') AS status
  FROM permissions
  WHERE code IS NOT NULL
    AND module IS NOT NULL
    AND COALESCE(status, 'Active') = 'Active'
  ORDER BY permission_id
`;

export async function listCatalogPermissions(pool) {
  const result = await pool.query(CATALOG_SQL);
  return result.rows;
}

export function groupPermissionsByModule(permissions) {
  const byModule = new Map();
  for (const moduleName of MODULE_ORDER) {
    byModule.set(moduleName, []);
  }
  for (const perm of permissions) {
    const key = perm.module || 'Other';
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key).push(perm);
  }
  return MODULE_ORDER
    .filter((name) => (byModule.get(name) || []).length > 0)
    .map((name) => ({
      module: name,
      permissions: byModule.get(name),
    }));
}

async function loadUserRole(pool, userId) {
  const result = await pool.query(
    `SELECT u.id, u.role_id, r.slug AS role_slug, r.role_name
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.id = $1`,
    [Number(userId)]
  );
  return result.rows[0] || null;
}

async function loadRoleGrantedMap(pool, roleId) {
  const result = await pool.query(
    `SELECT permission_id, granted
     FROM role_permissions
     WHERE role_id = $1`,
    [Number(roleId)]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(Number(row.permission_id), Boolean(row.granted));
  }
  return map;
}

async function loadUserGrantedMap(pool, userId) {
  const result = await pool.query(
    `SELECT permission_id, granted
     FROM user_permissions
     WHERE user_id = $1`,
    [Number(userId)]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(Number(row.permission_id), Boolean(row.granted));
  }
  return { map, hasCustom: result.rows.length > 0 };
}

/**
 * Returns catalog permissions with granted + source for a target user.
 */
export async function getUserPermissionMatrix(pool, userId) {
  const user = await loadUserRole(pool, userId);
  if (!user) return null;

  const catalog = await listCatalogPermissions(pool);
  const roleMap = await loadRoleGrantedMap(pool, user.role_id);
  const { map: userMap, hasCustom } = await loadUserGrantedMap(pool, userId);
  const isSuperAdmin = user.role_slug === 'super_admin';

  let permissions = catalog.map((perm) => {
    const id = Number(perm.permission_id);
    let granted = false;
    let source = 'none';

    if (isSuperAdmin) {
      granted = true;
      source = 'super_admin';
    } else if (hasCustom && userMap.has(id)) {
      granted = userMap.get(id);
      source = 'user';
    } else if (hasCustom) {
      granted = false;
      source = 'user';
    } else if (roleMap.has(id)) {
      granted = roleMap.get(id);
      source = 'role';
    }

    return {
      permission_id: id,
      label: perm.label,
      description: perm.description,
      module: perm.module,
      code: perm.code,
      granted,
      source,
    };
  });

  // Manage grants imply View for display + effective access consistency.
  const byCode = new Map(permissions.map((p) => [p.code, p]));
  for (const [manageCode, viewCode] of Object.entries(MANAGE_IMPLIES_VIEW)) {
    const managePerm = byCode.get(manageCode);
    const viewPerm = byCode.get(viewCode);
    if (managePerm?.granted && viewPerm && !viewPerm.granted) {
      viewPerm.granted = true;
      if (viewPerm.source === 'none') viewPerm.source = managePerm.source;
    }
  }

  return {
    user: {
      id: user.id,
      role_id: user.role_id,
      role_slug: user.role_slug,
      role_name: user.role_name,
    },
    hasCustomPermissions: hasCustom,
    locked: isSuperAdmin,
    permissions,
    modules: groupPermissionsByModule(permissions),
  };
}

/**
 * Set of permission codes the authenticated user is allowed to use.
 */
export async function resolvePermissionCodes(pool, { userId, roleId, roleSlug }) {
  if (roleSlug === 'super_admin') {
    const catalog = await listCatalogPermissions(pool);
    return new Set(catalog.map((p) => p.code).filter(Boolean));
  }

  const catalog = await listCatalogPermissions(pool);
  const roleMap = await loadRoleGrantedMap(pool, roleId);
  const { map: userMap, hasCustom } = await loadUserGrantedMap(pool, userId);
  const codes = new Set();

  for (const perm of catalog) {
    const id = Number(perm.permission_id);
    let granted = false;
    if (hasCustom && userMap.has(id)) granted = userMap.get(id);
    else if (hasCustom) granted = false;
    else if (roleMap.has(id)) granted = roleMap.get(id);
    if (granted && perm.code) codes.add(perm.code);
  }

  return applyManageImpliesView(codes);
}

/**
 * Persist an explicit permission map for one user.
 * Body shape: { permissions: { [permission_id]: boolean } }
 */
export async function saveUserPermissions(pool, userId, permissionsMap) {
  const user = await loadUserRole(pool, userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  if (user.role_slug === 'super_admin') {
    const err = new Error('Super Admin permissions cannot be modified.');
    err.status = 403;
    throw err;
  }

  const catalog = await listCatalogPermissions(pool);
  const catalogIds = new Set(catalog.map((p) => Number(p.permission_id)));
  const normalizedMap = expandGrantsWithView(permissionsMap || {}, catalog);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM user_permissions WHERE user_id = $1`, [Number(userId)]);

    for (const [key, granted] of Object.entries(normalizedMap)) {
      const permId = Number(key);
      if (!catalogIds.has(permId)) continue;
      await client.query(
        `INSERT INTO user_permissions (user_id, permission_id, granted)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, permission_id) DO UPDATE
           SET granted = $3, updated_at = NOW()`,
        [Number(userId), permId, Boolean(granted)]
      );
    }

    // Ensure every catalog permission has an explicit row so reload is stable.
    for (const perm of catalog) {
      const id = Number(perm.permission_id);
      if (Object.prototype.hasOwnProperty.call(normalizedMap, String(id))
        || Object.prototype.hasOwnProperty.call(normalizedMap, id)) {
        continue;
      }
      await client.query(
        `INSERT INTO user_permissions (user_id, permission_id, granted)
         VALUES ($1, $2, FALSE)
         ON CONFLICT (user_id, permission_id) DO NOTHING`,
        [Number(userId), id]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getUserPermissionMatrix(pool, userId);
}

export function userHasPermission(user, ...codes) {
  if (!user) return false;
  if (user.roleSlug === 'super_admin') return true;
  const set = user.permissionCodes;
  if (!set || typeof set.has !== 'function') return false;
  return codes.some((code) => set.has(code));
}
