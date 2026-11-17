import { AUDIT_STATUS, writeAuditLog } from './auditLog.js';
import { insertUserNotification } from './creditInvestigationNotifications.js';

export const BRANCH_POLICY_KEY = 'branch_policies';
export const INACTIVITY_MODES = ['off', 'notify', 'auto'];
export const INACTIVITY_MONTHS_MIN = 1;
export const INACTIVITY_MONTHS_MAX = 36;

export const DEFAULT_BRANCH_POLICIES = {
  inactivity: {
    mode: 'off',
    inactivityMonths: null,
    reactivateOnActivity: true,
    notifyOperatingManagers: true,
  },
};

export const OPERATIONS_STATES = ['operating', 'suspended', 'ceased'];

export function normalizeBranchPolicies(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const inactivity = src.inactivity && typeof src.inactivity === 'object' ? src.inactivity : {};
  const mode = INACTIVITY_MODES.includes(inactivity.mode) ? inactivity.mode : 'off';
  const months = Number(inactivity.inactivityMonths);
  return {
    inactivity: {
      mode,
      inactivityMonths: Number.isInteger(months) && months > 0 ? months : null,
      reactivateOnActivity: inactivity.reactivateOnActivity !== false,
      notifyOperatingManagers: inactivity.notifyOperatingManagers !== false,
    },
  };
}

export function validateBranchPolicies(input) {
  const policies = normalizeBranchPolicies(input);
  const { mode, inactivityMonths } = policies.inactivity;
  if (mode !== 'off') {
    if (!Number.isInteger(inactivityMonths)) {
      return { error: 'Set the number of months without qualifying branch activity before this policy applies.' };
    }
    if (inactivityMonths < INACTIVITY_MONTHS_MIN || inactivityMonths > INACTIVITY_MONTHS_MAX) {
      return {
        error: `Inactivity threshold must be between ${INACTIVITY_MONTHS_MIN} and ${INACTIVITY_MONTHS_MAX} months.`,
      };
    }
  }
  return { policies };
}

export async function loadBranchPolicies(db) {
  try {
    const result = await db.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = $1`,
      [BRANCH_POLICY_KEY]
    );
    if (!result.rows.length) return DEFAULT_BRANCH_POLICIES;
    const raw = result.rows[0].setting_value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeBranchPolicies(parsed);
  } catch {
    return DEFAULT_BRANCH_POLICIES;
  }
}

export async function saveBranchPolicies(db, policies) {
  await db.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
    [BRANCH_POLICY_KEY, JSON.stringify(policies)]
  );
  return policies;
}

/** Latest qualifying business activity for a branch (sales, collections, inventory docs, field reports). */
export async function computeBranchLastActivity(db, branchId) {
  const result = await db.query(
    `SELECT GREATEST(
       (SELECT MAX(si.invoices_date::timestamptz) FROM sales_invoices si WHERE si.branch_id = $1),
       (SELECT MAX(cp.payment_date::timestamptz) FROM collection_payment cp WHERE cp.branch_id = $1),
       (SELECT MAX(it.created_at) FROM inventory_transfers it
         WHERE it.source_branch_id = $1 OR it.destination_branch_id = $1),
       (SELECT MAX(rh.created_at) FROM restock_headers rh WHERE rh.branch_id = $1),
       (SELECT MAX(far.created_at)
          FROM field_activity_reports far
          JOIN field_visits fv ON fv.visit_id = far.visit_id
          JOIN users u ON u.id = fv.user_id
         WHERE u.branch_id = $1),
       (SELECT b.created_at FROM branches b WHERE b.id = $1)
     ) AS last_activity_at`,
    [Number(branchId)]
  );
  return result.rows[0]?.last_activity_at || null;
}

export async function refreshBranchLastActivity(db, branchId) {
  const lastActivityAt = await computeBranchLastActivity(db, branchId);
  await db.query(
    `UPDATE branches SET last_activity_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [Number(branchId), lastActivityAt]
  );
  return lastActivityAt;
}

export async function findInactivityCandidates(db, policies) {
  const { inactivityMonths } = policies.inactivity;
  if (!Number.isInteger(inactivityMonths)) return [];

  const result = await db.query(
    `WITH activity AS (
       SELECT b.id AS branch_id,
              GREATEST(
                (SELECT MAX(si.invoices_date::timestamptz) FROM sales_invoices si WHERE si.branch_id = b.id),
                (SELECT MAX(cp.payment_date::timestamptz) FROM collection_payment cp WHERE cp.branch_id = b.id),
                (SELECT MAX(it.created_at) FROM inventory_transfers it
                  WHERE it.source_branch_id = b.id OR it.destination_branch_id = b.id),
                (SELECT MAX(rh.created_at) FROM restock_headers rh WHERE rh.branch_id = b.id),
                (SELECT MAX(far.created_at)
                   FROM field_activity_reports far
                   JOIN field_visits fv ON fv.visit_id = far.visit_id
                   JOIN users u ON u.id = fv.user_id
                  WHERE u.branch_id = b.id),
                b.created_at
              ) AS last_activity_at
         FROM branches b
     )
     SELECT b.id, b.branch_code, b.name, b.status, b.operations_state, b.status_policy_key,
            a.last_activity_at,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - a.last_activity_at)) / (86400.0 * 30))::int AS months_inactive
       FROM branches b
       JOIN activity a ON a.branch_id = b.id
      WHERE b.operations_state = 'operating'
        AND b.status = 'Active'
        AND a.last_activity_at < NOW() - make_interval(months => $1)
      ORDER BY a.last_activity_at`,
    [inactivityMonths]
  );
  return result.rows;
}

export async function findReactivationCandidates(db, policies) {
  if (!policies.inactivity.reactivateOnActivity) return [];
  const { inactivityMonths } = policies.inactivity;
  if (!Number.isInteger(inactivityMonths)) return [];

  const result = await db.query(
    `WITH activity AS (
       SELECT b.id AS branch_id,
              GREATEST(
                (SELECT MAX(si.invoices_date::timestamptz) FROM sales_invoices si WHERE si.branch_id = b.id),
                (SELECT MAX(cp.payment_date::timestamptz) FROM collection_payment cp WHERE cp.branch_id = b.id),
                (SELECT MAX(it.created_at) FROM inventory_transfers it
                  WHERE it.source_branch_id = b.id OR it.destination_branch_id = b.id),
                (SELECT MAX(rh.created_at) FROM restock_headers rh WHERE rh.branch_id = b.id),
                (SELECT MAX(far.created_at)
                   FROM field_activity_reports far
                   JOIN field_visits fv ON fv.visit_id = far.visit_id
                   JOIN users u ON u.id = fv.user_id
                  WHERE u.branch_id = b.id),
                b.created_at
              ) AS last_activity_at
         FROM branches b
     )
     SELECT b.id, b.branch_code, b.name, b.status, b.operations_state, b.status_policy_key,
            a.last_activity_at
       FROM branches b
       JOIN activity a ON a.branch_id = b.id
      WHERE b.operations_state = 'operating'
        AND b.status = 'Inactive'
        AND b.status_policy_key = 'inactivity'
        AND a.last_activity_at >= NOW() - make_interval(months => $1)
      ORDER BY a.last_activity_at DESC`,
    [inactivityMonths]
  );
  return result.rows;
}

async function claimDailyRun(pool, key) {
  try {
    const result = await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (setting_key) DO NOTHING
       RETURNING setting_key`,
      [key, JSON.stringify({ claimedAt: new Date().toISOString() })]
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
    await insertUserNotification(pool, { userId: row.id, title, message, category: 'Branch Management' });
  }
}

/**
 * Apply formal operations state (suspended / ceased / resume operating).
 * This is the authorized recording mechanism — the system does not invent cessation.
 */
export async function applyBranchOperationsState(client, branch, {
  operationsState,
  reason,
  actorId = null,
}) {
  if (!OPERATIONS_STATES.includes(operationsState)) {
    throw new Error('Invalid operations state.');
  }
  const trimmedReason = String(reason || '').trim();
  if (operationsState !== 'operating' && trimmedReason.length < 5) {
    throw new Error('Provide a reason (at least 5 characters) when recording suspension or cessation.');
  }

  let nextStatus = branch.status;
  let statusReason = branch.status_reason || null;
  let statusPolicyKey = branch.status_policy_key || null;

  if (operationsState === 'suspended' || operationsState === 'ceased') {
    nextStatus = 'Inactive';
    statusReason = trimmedReason;
    statusPolicyKey = 'operations';
  } else if (branch.operations_state !== 'operating' && operationsState === 'operating') {
    nextStatus = 'Active';
    statusReason = trimmedReason || 'Operations resumed by authorized administrator.';
    statusPolicyKey = 'operations';
  }

  const result = await client.query(
    `UPDATE branches
        SET operations_state = $2,
            operations_reason = $3,
            operations_recorded_at = NOW(),
            operations_recorded_by = $4,
            status = $5,
            status_reason = $6,
            status_changed_at = NOW(),
            status_changed_by = $4,
            status_policy_key = $7,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      branch.id,
      operationsState,
      operationsState === 'operating' ? (trimmedReason || null) : trimmedReason,
      actorId,
      nextStatus,
      statusReason,
      statusPolicyKey,
    ]
  );
  return result.rows[0];
}

export async function runBranchStatusSweep(pool, { force = false } = {}) {
  const policies = await loadBranchPolicies(pool);
  const { mode, inactivityMonths, reactivateOnActivity, notifyOperatingManagers: shouldNotify } = policies.inactivity;
  if (mode === 'off' || !Number.isInteger(inactivityMonths)) return { skipped: 'off' };

  const today = new Date().toISOString().slice(0, 10);
  if (!force && !(await claimDailyRun(pool, `branch-status-sweep:${today}`))) {
    return { skipped: 'already_ran' };
  }

  const candidates = await findInactivityCandidates(pool, policies);
  const deactivated = [];
  const flagged = [];
  const reactivated = [];

  for (const candidate of candidates) {
    const label = `${candidate.name} (${candidate.branch_code})`;
    if (mode !== 'auto') {
      flagged.push(label);
      continue;
    }
    const reason = `Automatically set Inactive after ${candidate.months_inactive} months without qualifying business activity (policy threshold: ${inactivityMonths} months).`;
    try {
      await pool.query(
        `UPDATE branches
            SET status = 'Inactive',
                status_reason = $2,
                status_changed_at = NOW(),
                status_changed_by = NULL,
                status_policy_key = 'inactivity',
                last_activity_at = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [candidate.id, reason, candidate.last_activity_at]
      );
      await writeAuditLog(pool, {
        userId: null,
        userName: 'System (branch inactivity policy)',
        module: 'Branch Management',
        activity: 'Automatic Deactivation',
        action: 'Automatic Deactivation',
        description: `${label}: ${reason}`,
        status: AUDIT_STATUS.ARCHIVED,
        affectedRecord: `branch:${candidate.id}`,
        branchId: candidate.id,
      });
      deactivated.push(label);
    } catch (err) {
      console.error('[BranchStatus] deactivate failed for branch', candidate.id, err.message);
    }
  }

  if (mode === 'auto' && reactivateOnActivity) {
    const resume = await findReactivationCandidates(pool, policies);
    for (const candidate of resume) {
      const label = `${candidate.name} (${candidate.branch_code})`;
      const reason = `Automatically reactivated after qualifying business activity resumed (within ${inactivityMonths}-month policy window).`;
      try {
        await pool.query(
          `UPDATE branches
              SET status = 'Active',
                  status_reason = $2,
                  status_changed_at = NOW(),
                  status_changed_by = NULL,
                  status_policy_key = 'inactivity',
                  last_activity_at = $3,
                  updated_at = NOW()
            WHERE id = $1
              AND operations_state = 'operating'
              AND status_policy_key = 'inactivity'`,
          [candidate.id, reason, candidate.last_activity_at]
        );
        await writeAuditLog(pool, {
          userId: null,
          userName: 'System (branch inactivity policy)',
          module: 'Branch Management',
          activity: 'Automatic Reactivation',
          action: 'Automatic Reactivation',
          description: `${label}: ${reason}`,
          status: AUDIT_STATUS.UPDATED,
          affectedRecord: `branch:${candidate.id}`,
          branchId: candidate.id,
        });
        reactivated.push(label);
      } catch (err) {
        console.error('[BranchStatus] reactivate failed for branch', candidate.id, err.message);
      }
    }
  }

  if (shouldNotify && (deactivated.length || flagged.length || reactivated.length)) {
    const lines = [];
    if (deactivated.length) lines.push(`Set Inactive: ${deactivated.join(', ')}.`);
    if (flagged.length) lines.push(`Inactive for ${inactivityMonths}+ months (review in Branch Management): ${flagged.join(', ')}.`);
    if (reactivated.length) lines.push(`Reactivated after resumed activity: ${reactivated.join(', ')}.`);
    await notifyOperatingManagers(pool, {
      title: mode === 'auto' ? 'Branch status policy applied' : 'Branches need inactivity review',
      message: lines.join(' '),
    });
  }

  return { deactivated, flagged, reactivated };
}

export function startBranchStatusSweep(pool) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runBranchStatusSweep(pool);
    } catch (err) {
      console.error('[BranchStatus] sweep failed:', err.message);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(run, 3 * 60 * 1000);
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  if (typeof first.unref === 'function') first.unref();
  if (typeof timer.unref === 'function') timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
