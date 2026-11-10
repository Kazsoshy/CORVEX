/**
 * Scheduled / event-driven security detectors.
 * Analyze audit logs, auth failures, permission changes, and insecure config.
 */

import { recordSecurityEvent, updateMonitorHealth } from './eventStore.js';

export async function analyzeFailedLogins(pool) {
  await updateMonitorHealth(pool, 'audit_analyzer', 'Active', 'Analyzing authentication failures…');
  await updateMonitorHealth(pool, 'auth_monitor', 'Active', 'Correlating login failures…');

  const result = await pool.query(
    `SELECT
       COALESCE(NULLIF(ip_address, ''), 'unknown') AS ip_address,
       COUNT(*)::int AS failures,
       MAX(created_at) AS last_seen,
       MIN(created_at) AS first_seen,
       ARRAY_AGG(DISTINCT user_name) FILTER (WHERE user_name IS NOT NULL) AS users
     FROM audit_logs
     WHERE (
         action ILIKE '%login%fail%'
         OR action = 'Failed Login'
         OR status = 'Failed Login'
         OR status_details ILIKE '%Failed Login%'
       )
       AND created_at >= NOW() - INTERVAL '15 minutes'
     GROUP BY 1
     HAVING COUNT(*) >= 5
     ORDER BY failures DESC`
  );

  let created = 0;
  for (const row of result.rows) {
    const severity = row.failures >= 10 ? 'Critical' : 'High';
    const users = Array.isArray(row.users) ? row.users.filter(Boolean).slice(0, 5) : [];
    const out = await recordSecurityEvent(pool, {
      eventKey: `bruteforce:${row.ip_address}:${String(row.first_seen)}`,
      threatType: 'Brute-Force Login Attempt',
      severity,
      title: `Brute-force login attempts from ${row.ip_address}`,
      description: `${row.failures} failed login attempts detected within 15 minutes from IP ${row.ip_address}${users.length ? ` targeting ${users.join(', ')}` : ''}.`,
      detectionMethod: 'Audit log correlation (failed authentication burst)',
      evidence: {
        failures: row.failures,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        users,
      },
      sourceIp: row.ip_address,
      userName: users[0] || null,
      affectedResource: 'Authentication',
      autoAction: 'alerted',
    });
    if (out.created) created += 1;
  }

  // Accounts with repeated failures — recommend disable (never auto-disable)
  const accountBurst = await pool.query(
    `SELECT user_id, user_name, COUNT(*)::int AS failures, MAX(created_at) AS last_seen
     FROM audit_logs
     WHERE (
         action ILIKE '%login%fail%'
         OR action = 'Failed Login'
         OR status = 'Failed Login'
         OR status_details ILIKE '%Failed Login%'
       )
       AND created_at >= NOW() - INTERVAL '30 minutes'
       AND user_id IS NOT NULL
     GROUP BY user_id, user_name
     HAVING COUNT(*) >= 8`
  );

  for (const row of accountBurst.rows) {
    const out = await recordSecurityEvent(pool, {
      eventKey: `auth-burst-user:${row.user_id}:${String(row.last_seen).slice(0, 16)}`,
      threatType: 'Unauthorized Access Attempt',
      severity: 'High',
      title: `Repeated failed logins for ${row.user_name}`,
      description: `${row.failures} failed logins for account “${row.user_name}” in 30 minutes. Recommendation: review and temporarily disable the account if compromise is suspected.`,
      detectionMethod: 'Per-account authentication failure correlation',
      evidence: { userId: row.user_id, failures: row.failures, lastSeen: row.last_seen },
      userId: row.user_id,
      userName: row.user_name,
      affectedResource: `user:${row.user_id}`,
      autoAction: 'recommend_disable',
    });
    if (out.created) created += 1;
  }

  await updateMonitorHealth(
    pool,
    'audit_analyzer',
    'Active',
    `Auth analysis complete; ${created} new incident(s)`
  );
  await updateMonitorHealth(pool, 'auth_monitor', 'Active', `Last sweep created ${created} event(s)`);
  return { created };
}

export async function recordAuthFailureEvent(pool, {
  userId = null,
  userName = null,
  email = null,
  ip,
  reason,
  attemptCount = null,
  locked = false,
}) {
  await updateMonitorHealth(pool, 'auth_monitor', 'Active', `Login failure from ${ip}`);
  if (locked || (attemptCount != null && attemptCount >= 10)) {
    await recordSecurityEvent(pool, {
      eventKey: `auth-lock:${ip}:${String(email || userName || 'unknown').toLowerCase()}`,
      threatType: 'Brute-Force Login Attempt',
      severity: 'High',
      title: locked ? 'Login lockout triggered' : 'Authentication failure threshold reached',
      description: `Account lockout/threshold reached for ${email || userName || 'unknown'} from ${ip}. Reason: ${reason}.`,
      detectionMethod: 'Live authentication monitor',
      evidence: { email, reason, attemptCount, locked },
      sourceIp: ip,
      userId,
      userName: userName || email,
      affectedResource: 'Authentication',
      autoAction: 'alerted',
    });
  }
}

export async function recordPermissionChangeEvent(pool, {
  actorId,
  actorName,
  roleId,
  roleName,
  roleSlug,
  changedPermissions = {},
  sourceIp = null,
}) {
  const privilegedLabels = new Set([
    'Manage Users',
    'Manage Roles',
    'Manage System',
    'Assign Permissions',
    'Create User',
    'Edit User',
    'Disable User',
    'Update System Settings',
    'Restore Backup',
    'Manage Security Settings',
  ]);
  const privilegedCodes = new Set([
    'roles.assign',
    'users.create',
    'users.edit',
    'users.disable',
    'users.activate',
    'settings.update',
    'backup.restore',
    'security.manage',
  ]);

  // Load labels for granted permission ids
  const ids = Object.entries(changedPermissions)
    .filter(([, granted]) => granted)
    .map(([id]) => Number(id))
    .filter((n) => Number.isFinite(n));

  if (!ids.length) return;

  const labelsRes = await pool.query(
    `SELECT permission_id, label, code FROM permissions WHERE permission_id = ANY($1::int[])`,
    [ids]
  );
  const privileged = labelsRes.rows.filter(
    (r) => privilegedLabels.has(r.label) || (r.code && privilegedCodes.has(r.code))
  );
  if (!privileged.length) return;

  await recordSecurityEvent(pool, {
    eventKey: `perm-change:${roleId}:${privileged.map((p) => p.permission_id).sort().join(',')}:${Date.now().toString().slice(0, -5)}`,
    threatType: 'Unauthorized Permission Change',
    severity: roleSlug === 'customer' || roleSlug === 'collector' ? 'Critical' : 'High',
    title: `Privileged permissions updated on ${roleName || roleSlug}`,
    description: `${actorName || 'Administrator'} granted privileged permission(s) (${privileged.map((p) => p.label).join(', ')}) to role “${roleName || roleSlug}”.`,
    detectionMethod: 'Role permission change monitor',
    evidence: {
      actorId,
      roleId,
      roleSlug,
      privileged: privileged.map((p) => ({ id: p.permission_id, label: p.label })),
    },
    sourceIp,
    userId: actorId,
    userName: actorName,
    affectedResource: `role:${roleId}`,
    autoAction: 'alerted',
  });
}

export async function assessInsecureConfiguration(pool) {
  await updateMonitorHealth(pool, 'config_assessment', 'Active', 'Assessing runtime configuration…');
  const findings = [];

  if (!process.env.AUTH_SECRET) {
    findings.push({
      key: 'config:auth-secret-missing',
      title: 'AUTH_SECRET is not set',
      description: 'Session tokens are signed with an ephemeral secret. Sessions reset on process restart and may weaken session integrity across instances.',
      severity: 'High',
      resource: 'AUTH_SECRET',
    });
  }

  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === 'postgres' || process.env.DB_PASSWORD === 'password') {
    findings.push({
      key: 'config:weak-db-password',
      title: 'Weak or default database password detected',
      description: 'Database password appears unset, default, or trivially weak. Use a strong unique credential.',
      severity: 'Critical',
      resource: 'DB_PASSWORD',
    });
  }

  if ((process.env.NODE_ENV || 'development') === 'production' && process.env.CORS_ORIGIN === '*') {
    findings.push({
      key: 'config:cors-open',
      title: 'Overly permissive CORS configuration',
      description: 'Production CORS appears open (*). Restrict allowed origins to trusted frontends.',
      severity: 'Medium',
      resource: 'CORS_ORIGIN',
    });
  }

  if (!process.env.CLAMAV_HOST) {
    // Informational health only — not an incident every sweep
    await updateMonitorHealth(
      pool,
      'clamav_integration',
      'Degraded',
      'Optional ClamAV not configured; signature scanner remains active'
    );
  }

  let created = 0;
  for (const f of findings) {
    const out = await recordSecurityEvent(pool, {
      eventKey: f.key,
      threatType: 'Insecure System Configuration',
      severity: f.severity,
      title: f.title,
      description: f.description,
      detectionMethod: 'Scheduled configuration assessment',
      evidence: { envCheck: f.resource },
      affectedResource: f.resource,
      autoAction: 'alerted',
    });
    if (out.created) created += 1;
  }

  await updateMonitorHealth(
    pool,
    'config_assessment',
    'Active',
    findings.length ? `${findings.length} configuration risk(s)` : 'No insecure configuration findings'
  );
  return { created, findings: findings.length };
}
