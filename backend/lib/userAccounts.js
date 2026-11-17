import { AUDIT_STATUS, writeAuditLog } from './auditLog.js';
import { insertUserNotification } from './creditInvestigationNotifications.js';
import {
  BRANCH_ROLE_SLUGS,
  loadUserDependencies,
  resolveUserDependencies,
} from './userDependencies.js';

const BM_SLOT_LOCK_NAMESPACE = 4207;

export const USER_POLICY_KEY = 'user_policies';
export const INACTIVITY_MODES = ['off', 'notify', 'auto'];
export const INACTIVITY_DAYS_MIN = 14;
export const INACTIVITY_DAYS_MAX = 730;

export const DEFAULT_USER_POLICIES = {
  inactivity: {
    mode: 'off',
    inactivityDays: null,
    includeNeverSignedIn: false,
    notifyOperatingManagers: true,
  },
};

export function displayName(row) {
  return [row?.first_name, row?.middle_name, row?.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    || row?.email
    || `User #${row?.id}`;
}

/** Serialises Branch Manager slot checks per branch for the current transaction. */
export async function lockBranchManagerSlot(client, branchId) {
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [BM_SLOT_LOCK_NAMESPACE, Number(branchId)]);
}

export async function findActiveBranchManager(db, branchId, excludeUserId = null) {
  const result = await db.query(
    `SELECT u.id, u.employee_id, u.first_name, u.middle_name, u.last_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
      WHERE r.slug = 'branch_manager'
        AND u.status = 'Active'
        AND u.branch_id = $1
        AND ($2::int IS NULL OR u.id <> $2::int)
      ORDER BY u.id
      LIMIT 1`,
    [Number(branchId), excludeUserId == null ? null : Number(excludeUserId)]
  );
  return result.rows[0] || null;
}

export async function loadBranch(db, branchId) {
  const result = await db.query(`SELECT id, name, status FROM branches WHERE id = $1`, [Number(branchId)]);
  return result.rows[0] || null;
}

/**
 * Soft-disable an employee inside an open transaction: resolve open work, block
 * sign-in, and end every existing session. History and the email are kept.
 */
export async function disableUserAccount(client, user, {
  actorId = null,
  reason,
  reassignToUserId = null,
  acknowledgeHandover = false,
}) {
  const resolution = await resolveUserDependencies(client, user, { reassignToUserId, acknowledgeHandover });
  await client.query(
    `UPDATE users
        SET status = 'Inactive',
            status_reason = $2,
            status_changed_at = NOW(),
            status_changed_by = $3,
            session_revoked_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [user.id, reason, actorId]
  );
  if (user.role_slug === 'branch_manager') {
    await client.query(`UPDATE branches SET manager_id = NULL, updated_at = NOW() WHERE manager_id = $1`, [user.id]);
  }
  return resolution;
}

export function describeMoved(moved = {}) {
  const parts = Object.entries(moved)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${key}=${n}`);
  return parts.length ? parts.join(', ') : 'none';
}

// ── Policies ──────────────────────────────────────────────────────────────────

export function normalizeUserPolicies(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const inactivity = src.inactivity && typeof src.inactivity === 'object' ? src.inactivity : {};
  const mode = INACTIVITY_MODES.includes(inactivity.mode) ? inactivity.mode : 'off';
  const days = Number(inactivity.inactivityDays);
  return {
    inactivity: {
      mode,
      inactivityDays: Number.isInteger(days) && days > 0 ? days : null,
      includeNeverSignedIn: Boolean(inactivity.includeNeverSignedIn),
      notifyOperatingManagers: inactivity.notifyOperatingManagers !== false,
    },
  };
}

export function validateUserPolicies(input) {
  const policies = normalizeUserPolicies(input);
  const { mode, inactivityDays } = policies.inactivity;
  if (mode !== 'off') {
    if (!Number.isInteger(inactivityDays)) {
      return { error: 'Set the number of days without sign-in before this policy applies.' };
    }
    if (inactivityDays < INACTIVITY_DAYS_MIN || inactivityDays > INACTIVITY_DAYS_MAX) {
      return { error: `Inactivity threshold must be between ${INACTIVITY_DAYS_MIN} and ${INACTIVITY_DAYS_MAX} days.` };
    }
  }
  return { policies };
}

export async function loadUserPolicies(db) {
  try {
    const result = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = $1`, [USER_POLICY_KEY]);
    if (!result.rows.length) return normalizeUserPolicies(DEFAULT_USER_POLICIES);
    return normalizeUserPolicies(JSON.parse(result.rows[0].setting_value || '{}'));
  } catch {
    return normalizeUserPolicies(DEFAULT_USER_POLICIES);
  }
}

export async function saveUserPolicies(db, policies) {
  await db.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
    [USER_POLICY_KEY, JSON.stringify(policies)]
  );
}

// ── Inactivity review ─────────────────────────────────────────────────────────

export async function findInactivityCandidates(db, policies) {
  const { inactivityDays, includeNeverSignedIn } = policies.inactivity;
  if (!Number.isInteger(inactivityDays)) return [];
  const result = await db.query(
    `SELECT u.id, u.employee_id, u.first_name, u.middle_name, u.last_name, u.email,
            u.role_id, u.branch_id, u.last_login, u.created_at,
            r.slug AS role_slug, r.role_name, b.name AS branch_name,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(u.last_login, u.created_at::timestamptz))) / 86400)::int AS days_inactive
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
      WHERE u.status = 'Active'
        AND r.slug = ANY($1::text[])
        AND (
          (u.last_login IS NOT NULL AND u.last_login < NOW() - make_interval(days => $2))
          OR ($3::boolean AND u.last_login IS NULL AND u.created_at < NOW() - make_interval(days => $2))
        )
      ORDER BY COALESCE(u.last_login, u.created_at::timestamptz)`,
    [[...BRANCH_ROLE_SLUGS], inactivityDays, includeNeverSignedIn]
  );
  const rows = [];
  for (const row of result.rows) {
    const deps = await loadUserDependencies(db, row);
    rows.push({ ...row, dependencies: deps });
  }
  return rows;
}

async function claimDailyRun(pool, key) {
  try {
    const result = await pool.query(
      `INSERT INTO notification_dedup (dedup_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING dedup_key`,
      [key]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

async function notifyOperatingManagers(pool, { title, message }) {
  const managers = await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE r.slug = 'operating_manager' AND u.status = 'Active'`
  );
  for (const row of managers.rows) {
    await insertUserNotification(pool, { userId: row.id, title, message, category: 'User Management' });
  }
}

/**
 * Server-side daily inactivity review. Runs in the API process (not the browser);
 * claims one run per calendar day so restarts and multiple timers do not repeat it.
 */
export async function runInactivitySweep(pool, { force = false } = {}) {
  const policies = await loadUserPolicies(pool);
  const { mode, inactivityDays, notifyOperatingManagers: shouldNotify } = policies.inactivity;
  if (mode === 'off' || !Number.isInteger(inactivityDays)) return { skipped: 'off' };

  const today = new Date().toISOString().slice(0, 10);
  if (!force && !(await claimDailyRun(pool, `user-inactivity-sweep:${today}`))) {
    return { skipped: 'already_ran' };
  }

  const candidates = await findInactivityCandidates(pool, policies);
  const disabled = [];
  const blocked = [];
  const flagged = [];

  for (const candidate of candidates) {
    const label = `${displayName(candidate)}${candidate.employee_id ? ` (${candidate.employee_id})` : ''}`;
    if (candidate.dependencies.hasAny) {
      blocked.push(label);
      continue;
    }
    if (mode !== 'auto') {
      flagged.push(label);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reason = `Automatically disabled after ${candidate.days_inactive} days without sign-in (policy threshold: ${inactivityDays} days).`;
      await disableUserAccount(client, candidate, { actorId: null, reason });
      await client.query('COMMIT');
      disabled.push(label);
      await writeAuditLog(pool, {
        userId: null,
        userName: 'System (inactivity policy)',
        module: 'User Management',
        activity: 'Automatic Deactivation',
        action: 'Automatic Deactivation',
        description: `${label}: ${reason}`,
        status: AUDIT_STATUS.ARCHIVED,
        affectedRecord: `user:${candidate.id}`,
        branchId: candidate.branch_id,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      blocked.push(label);
      console.error('[UserInactivity] disable failed for user', candidate.id, err.message);
    } finally {
      client.release();
    }
  }

  if (shouldNotify && (disabled.length || blocked.length || flagged.length)) {
    const lines = [];
    if (disabled.length) lines.push(`Disabled: ${disabled.join(', ')}.`);
    if (flagged.length) lines.push(`Inactive for ${inactivityDays}+ days (review in User Management): ${flagged.join(', ')}.`);
    if (blocked.length) lines.push(`Inactive but still holding open work, so not disabled: ${blocked.join(', ')}.`);
    await notifyOperatingManagers(pool, {
      title: mode === 'auto' ? 'Inactive accounts processed' : 'Inactive accounts need review',
      message: lines.join(' '),
    });
  }

  return { disabled, blocked, flagged };
}

export function startUserInactivitySweep(pool) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runInactivitySweep(pool);
    } catch (err) {
      console.error('[UserInactivity] sweep failed:', err.message);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(run, 2 * 60 * 1000);
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  if (typeof first.unref === 'function') first.unref();
  if (typeof timer.unref === 'function') timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
