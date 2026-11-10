/**
 * Central CORVEX audit logger.
 * Writes to existing audit_logs table (enriched columns when available).
 * Never logs passwords, tokens, or other secrets.
 */

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'new_password', 'confirm_password', 'current_password',
  'token', 'access_token', 'refresh_token', 'authorization', 'secret', 'AUTH_SECRET',
]);

export const AUDIT_STATUS = {
  FAILED_LOGIN: 'Failed Login',
  SUCCESSFUL_LOGIN: 'Successful Login',
  ACCOUNT_LOCKED: 'Account Locked',
  ACCOUNT_UNLOCKED: 'Account Unlocked',
  LOGOUT: 'Logout',
  PASSWORD_CHANGED: 'Password Changed',
  PASSWORD_RESET: 'Password Reset',
  UNAUTHORIZED: 'Unauthorized Access',
  CREATED: 'Created',
  UPDATED: 'Updated',
  DELETED: 'Deleted',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
  EXPORTED: 'Exported',
  IMPORTED: 'Imported',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};

function sanitizeValue(value) {
  if (value == null) return value;
  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value, (k, v) => (SENSITIVE_KEYS.has(String(k).toLowerCase()) ? '[REDACTED]' : v)));
    } catch {
      return '[unserializable]';
    }
  }
  return value;
}

export function summarizeChanges(before = {}, after = {}, fields = []) {
  const keys = fields.length ? fields : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  const parts = [];
  for (const key of keys) {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) continue;
    const prev = sanitizeValue(before?.[key]);
    const next = sanitizeValue(after?.[key]);
    if (String(prev ?? '') === String(next ?? '')) continue;
    parts.push(`${key}: "${prev ?? '—'}" → "${next ?? '—'}"`);
  }
  return parts.slice(0, 12).join('; ');
}

function actorFromReq(req) {
  const u = req?.currentUser;
  if (!u) return { userId: null, userName: null, roleName: null, branchId: null };
  const name = u.fullName || u.full_name
    || [u.first_name, u.last_name].filter(Boolean).join(' ')
    || u.email
    || null;
  return {
    userId: u.id ?? null,
    userName: name,
    roleName: u.roleName || u.role_name || u.role?.name || null,
    branchId: u.branchId ?? u.branch_id ?? null,
  };
}

export function clientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

async function resolveActor(db, userId, userName, roleName) {
  const needsName = !userName || userName === 'User' || userName === 'System';
  const needsRole = !roleName;
  if (!userId || (!needsName && !needsRole)) {
    return { userName: userName || 'System', roleName: roleName || null };
  }
  try {
    const result = await db.query(
      `SELECT
         COALESCE(
           NULLIF(TRIM(u.full_name), ''),
           NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
           u.email,
           'User'
         ) AS name,
         r.role_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.id = $1`,
      [userId]
    );
    const row = result.rows[0];
    return {
      userName: needsName ? (row?.name || userName || 'User') : userName,
      roleName: needsRole ? (row?.role_name || roleName || null) : roleName,
    };
  } catch {
    return { userName: userName || 'System', roleName: roleName || null };
  }
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} entry
 */
export async function writeAuditLog(db, entry = {}) {
  const {
    userId = null,
    userName = null,
    roleName = null,
    module = 'System',
    activity = null,
    action = null,
    description = '',
    status = AUDIT_STATUS.SUCCESS,
    ipAddress = 'unknown',
    affectedRecord = null,
    branchId = null,
    req = null,
  } = entry;

  const actor = req ? actorFromReq(req) : null;
  const finalUserId = userId ?? actor?.userId ?? null;
  const resolved = await resolveActor(
    db,
    finalUserId,
    userName || actor?.userName || null,
    roleName || actor?.roleName || null,
  );

  const finalUserName = String(resolved.userName || 'System').slice(0, 150);
  const finalRole = resolved.roleName ? String(resolved.roleName).slice(0, 100) : null;
  const finalAction = String(action || activity || status || 'Activity').slice(0, 150);
  const finalActivity = String(activity || action || status || 'Activity').slice(0, 150);
  const finalStatus = String(status || AUDIT_STATUS.SUCCESS).slice(0, 50);
  const finalIp = String(ipAddress || (req ? clientIp(req) : 'unknown') || 'unknown').slice(0, 45);
  const finalDesc = String(description || '').slice(0, 2000);
  const legacyDetail = finalDesc.slice(0, 500) || finalStatus;
  const finalModule = module ? String(module).slice(0, 100) : 'System';
  const rawBranch = branchId ?? actor?.branchId ?? null;
  const finalBranchId = Number.isFinite(Number(rawBranch)) && Number(rawBranch) > 0
    ? Number(rawBranch)
    : null;

  try {
    await db.query(
      `INSERT INTO audit_logs (
         user_id, user_name, action, ip_address, status_details,
         role_name, module, activity, description, status, affected_record, branch_id
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        finalUserId,
        finalUserName,
        finalAction,
        finalIp,
        legacyDetail,
        finalRole,
        finalModule,
        finalActivity,
        finalDesc || null,
        finalStatus,
        affectedRecord ? String(affectedRecord).slice(0, 200) : null,
        finalBranchId,
      ]
    );
  } catch (err) {
    if (err.code === '42703') {
      // Fall back if branch_id (or enrichment) columns are missing.
      try {
        await db.query(
          `INSERT INTO audit_logs (
             user_id, user_name, action, ip_address, status_details,
             role_name, module, activity, description, status, affected_record
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10, $11
           )`,
          [
            finalUserId,
            finalUserName,
            finalAction,
            finalIp,
            legacyDetail,
            finalRole,
            finalModule,
            finalActivity,
            finalDesc || null,
            finalStatus,
            affectedRecord ? String(affectedRecord).slice(0, 200) : null,
          ]
        );
        return;
      } catch (enrichedFallbackErr) {
        if (enrichedFallbackErr.code !== '42703') {
          console.error('[AuditLog] enriched fallback failed:', enrichedFallbackErr.message);
          return;
        }
      }
      try {
        await db.query(
          `INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details)
           VALUES ($1, $2, $3, $4, $5)`,
          [finalUserId, finalUserName, finalAction, finalIp, legacyDetail]
        );
        return;
      } catch (inner) {
        console.error('[AuditLog] legacy write failed:', inner.message);
        return;
      }
    }
    console.error('[AuditLog] write failed:', err.message);
  }
}

export async function writeAuditFromReq(db, req, partial = {}) {
  return writeAuditLog(db, {
    ...partial,
    req,
    ipAddress: partial.ipAddress || clientIp(req),
  });
}
