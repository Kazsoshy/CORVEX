/**
 * Branch Activity (BM audit trail) — scope by affected branch, not actor branch alone.
 */

/** Modules / patterns BM Branch Activity may show. */
export const BM_ACTIVITY_MODULE_GROUPS = {
  all: null,
  credit: {
    label: 'Credit Approvals',
    modules: ['Credit Approvals', 'Credit'],
    affectedPrefixes: ['credit_investigation:', 'credit_review:'],
  },
  approvals: {
    label: 'Approvals',
    modules: ['Approvals'],
    affectedPrefixes: ['invoice:', 'restock:', 'stock_count:', 'transfer:'],
  },
  collections: {
    label: 'Collections & Payments',
    modules: ['Collections and Payments', 'Collections', 'Payments'],
    affectedPrefixes: ['collection_payment:', 'payment:', 'receipt:'],
  },
  invoices: {
    label: 'Invoices',
    modules: ['Sales', 'Invoices'],
    affectedPrefixes: ['invoice:'],
    activityLike: ['%Invoice%'],
  },
  inventory: {
    label: 'Inventory Movements',
    modules: ['Inventory Management', 'Inventory'],
    affectedPrefixes: ['restock:', 'transfer:', 'stock_count:', 'product:'],
  },
};

/** Security / admin modules excluded from BM Branch Activity. */
export const BM_EXCLUDED_MODULE_PATTERNS = [
  'Authentication',
  'Users',
  'Roles',
  'Permissions',
  'System',
  'Configuration',
  'Security',
  'Branches',
];

/**
 * SQL fragment: derive affected branch for an audit row (alias `a`).
 * Prefers stored branch_id, then affected_record joins, then actor branch.
 */
export function affectedBranchSql() {
  return `COALESCE(
    a.branch_id,
    CASE
      WHEN a.affected_record ~ '^credit_investigation:[0-9]+$' THEN (
        SELECT ci.branch_id FROM credit_investigations ci
        WHERE ci.ci_id = NULLIF(substring(a.affected_record from ':(.*)$'), '')::int
      )
      WHEN a.affected_record ~ '^invoice:[0-9]+$' THEN (
        SELECT si.branch_id FROM sales_invoices si
        WHERE si.sales_invoices_id = NULLIF(substring(a.affected_record from ':(.*)$'), '')::int
      )
      WHEN a.affected_record ~ '^(collection_payment|payment):[0-9]+$' THEN (
        SELECT cp.branch_id FROM collection_payment cp
        WHERE cp.collectionpayment_id = NULLIF(substring(a.affected_record from ':(.*)$'), '')::int
      )
      WHEN a.affected_record ~ '^alert:[0-9]+$' THEN (
        SELECT oa.branch_id FROM operational_alerts oa
        WHERE oa.alert_id = NULLIF(substring(a.affected_record from ':(.*)$'), '')::int
      )
      WHEN a.affected_record ~ '^restock:[0-9]+$' THEN (
        SELECT rh.branch_id FROM restock_headers rh
        WHERE rh.restock_id = NULLIF(substring(a.affected_record from ':(.*)$'), '')::int
      )
      WHEN a.affected_record ~ '^stock_count:[0-9]+$' THEN (
        SELECT h.branch_id FROM stock_count_headers h
        WHERE h.count_id = NULLIF(substring(a.affected_record from ':(.*)$'), '')::int
      )
      WHEN a.affected_record ~ '^customer:[0-9]+$' THEN (
        SELECT c.branch_id FROM customers c
        WHERE c.customer_id = NULLIF(substring(a.affected_record from ':(.*)$'), '')::int
      )
      ELSE NULL
    END,
    actor.branch_id
  )`;
}

function pushExcludedModules(conditions, params, idx) {
  for (const pattern of BM_EXCLUDED_MODULE_PATTERNS) {
    conditions.push(`COALESCE(a.module, '') NOT ILIKE $${idx}`);
    params.push(pattern);
    idx += 1;
  }
  conditions.push(`COALESCE(a.action, '') NOT ILIKE '%login%'`);
  conditions.push(`COALESCE(a.activity, '') NOT ILIKE '%login%'`);
  conditions.push(`COALESCE(a.status, '') NOT ILIKE '%login%'`);
  return idx;
}

/**
 * List branch-relevant audit activity.
 * @param {import('pg').Pool} pool
 * @param {{
 *   branchId?: number|null,
 *   moduleGroup?: string,
 *   search?: string,
 *   actor?: string,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   limit?: number,
 * }} opts
 */
export async function listBranchActivity(pool, opts = {}) {
  const {
    branchId = null,
    moduleGroup = 'all',
    search,
    actor,
    dateFrom,
    dateTo,
    limit = 200,
  } = opts;

  const conditions = [];
  const params = [];
  let idx = 1;

  const branchExpr = affectedBranchSql();

  if (branchId != null && Number.isFinite(Number(branchId))) {
    conditions.push(`${branchExpr} = $${idx}`);
    params.push(Number(branchId));
    idx += 1;
  }

  idx = pushExcludedModules(conditions, params, idx);

  const group = BM_ACTIVITY_MODULE_GROUPS[moduleGroup];
  if (group) {
    const parts = [];
    for (const mod of group.modules || []) {
      parts.push(`COALESCE(a.module, '') ILIKE $${idx}`);
      params.push(`%${mod}%`);
      idx += 1;
    }
    for (const prefix of group.affectedPrefixes || []) {
      parts.push(`COALESCE(a.affected_record, '') ILIKE $${idx}`);
      params.push(`${prefix}%`);
      idx += 1;
    }
    for (const like of group.activityLike || []) {
      parts.push(`COALESCE(a.activity, a.action, '') ILIKE $${idx}`);
      params.push(like);
      idx += 1;
    }
    if (parts.length) {
      conditions.push(`(${parts.join(' OR ')})`);
    }
  } else {
    // "All Branch Activity" — still only operational/financial modules.
    conditions.push(`(
      COALESCE(a.module, '') ILIKE '%Credit%'
      OR COALESCE(a.module, '') ILIKE '%Approval%'
      OR COALESCE(a.module, '') ILIKE '%Collection%'
      OR COALESCE(a.module, '') ILIKE '%Payment%'
      OR COALESCE(a.module, '') ILIKE '%Inventory%'
      OR COALESCE(a.module, '') ILIKE '%Operation%'
      OR COALESCE(a.module, '') ILIKE '%Customer%'
      OR COALESCE(a.module, '') ILIKE '%Sales%'
      OR COALESCE(a.affected_record, '') ~ '^(credit_investigation|invoice|collection_payment|payment|alert|restock|stock_count|customer|transfer):'
    )`);
  }

  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    conditions.push(`(
      COALESCE(a.user_name, '') ILIKE $${idx}
      OR COALESCE(a.module, '') ILIKE $${idx}
      OR COALESCE(a.activity, '') ILIKE $${idx}
      OR COALESCE(a.action, '') ILIKE $${idx}
      OR COALESCE(a.description, a.status_details, '') ILIKE $${idx}
      OR COALESCE(a.affected_record, '') ILIKE $${idx}
    )`);
    params.push(q);
    idx += 1;
  }

  if (actor && String(actor).trim() && String(actor) !== 'all') {
    conditions.push(`COALESCE(a.user_name, '') ILIKE $${idx}`);
    params.push(`%${String(actor).trim()}%`);
    idx += 1;
  }

  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    conditions.push(`(a.created_at AT TIME ZONE 'Asia/Manila')::date >= $${idx}::date`);
    params.push(dateFrom);
    idx += 1;
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    conditions.push(`(a.created_at AT TIME ZONE 'Asia/Manila')::date <= $${idx}::date`);
    params.push(dateTo);
    idx += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const result = await pool.query(
    `SELECT
       scoped.audit_id,
       scoped.log_id,
       scoped.user_id,
       scoped.user_name,
       scoped.role_name,
       scoped.action,
       scoped.module,
       scoped.activity,
       scoped.description,
       scoped.status,
       scoped.status_details,
       scoped.affected_record,
       scoped.ip_address,
       scoped.created_at,
       scoped.stored_branch_id,
       scoped.branch_id,
       b.name AS branch_name
     FROM (
       SELECT
         a.log_id AS audit_id,
         a.log_id,
         a.user_id,
         a.user_name,
         a.role_name,
         a.action,
         a.module,
         a.activity,
         a.description,
         a.status,
         a.status_details,
         a.affected_record,
         a.ip_address,
         a.created_at,
         a.branch_id AS stored_branch_id,
         ${branchExpr} AS branch_id
       FROM audit_logs a
       LEFT JOIN users actor ON actor.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ${lim}
     ) scoped
     LEFT JOIN branches b ON b.id = scoped.branch_id`,
    params
  );

  return result.rows;
}

/** Human-readable activity label for BM table. */
export function formatBranchActivityLabel(row) {
  const raw = String(row?.activity || row?.action || '').trim();
  if (!raw) return 'Activity';
  const map = {
    'Collection recorded': 'Collection Recorded',
    'Collection confirmed': 'Payment Confirmed',
    'Collection rejected': 'Collection Rejected',
    'Collection reversed': 'Collection Reversed',
    'Approve Invoice': 'Invoice Approved',
    'Reject Invoice': 'Invoice Rejected',
    'Credit Approved': 'Credit Request Approved',
    'Credit Rejected': 'Credit Request Rejected',
    'Credit Revision Requested': 'Credit Returned for Revision',
    'Resolve Alert': 'Exception Resolved',
    'Assign Alert': 'Exception Assigned',
    'Escalate Alert': 'Exception Escalated',
  };
  if (map[raw]) return map[raw];
  if (/^Credit /i.test(raw)) {
    return raw.replace(/^Credit\s+/i, 'Credit Request ');
  }
  return raw;
}
