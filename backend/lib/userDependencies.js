/**
 * Open operational responsibilities that must be resolved before an employee
 * account is disabled, or before its role or branch changes.
 *
 * Only work that is still open counts. Completed or historical records (sales,
 * posted collections, approved reviews, audit trails) never block.
 *
 * Kinds:
 *  - reassign — work that can move to another active employee with the same role in the same branch
 *  - blocking — work that must finish or be decided first; it cannot be handed over
 *  - handover — branch-level queue items that stay with the branch for the next manager (needs acknowledgement)
 */

export const BRANCH_ROLE_SLUGS = new Set(['branch_manager', 'inventory_staff', 'sales_staff', 'collector']);
export const NON_EMPLOYEE_ROLE_SLUGS = new Set(['customer', 'client']);

const CHECKS = [
  // Sales agents
  {
    key: 'salesCustomerBook',
    roles: ['sales_staff'],
    kind: 'reassign',
    label: 'Active customers assigned to this sales agent',
    resolution: 'Choose another sales agent in the same branch to take over these customers.',
    count: `SELECT COUNT(*)::int AS n FROM customers WHERE assigned_sales_agent_id = $1 AND status = 'Active'`,
    reassign: `UPDATE customers SET assigned_sales_agent_id = $2, updated_at = NOW()
               WHERE assigned_sales_agent_id = $1 AND status = 'Active'`,
  },
  {
    key: 'queuedSalesAreas',
    roles: ['sales_staff'],
    kind: 'reassign',
    label: 'Upcoming sales area assignments (not started)',
    resolution: 'Choose another sales agent to cover these assignments.',
    count: `SELECT COUNT(*)::int AS n FROM sales_area_assignments WHERE sales_agent_id = $1 AND status = 'Assigned'`,
    reassign: `UPDATE sales_area_assignments SET sales_agent_id = $2, updated_at = NOW()
               WHERE sales_agent_id = $1 AND status = 'Assigned'`,
  },
  {
    key: 'inProgressSalesAreas',
    roles: ['sales_staff'],
    kind: 'blocking',
    label: 'Sales area assignments in progress',
    resolution: 'Wait for the agent to finish today\'s assignment, or have the Branch Manager close it in Sales Agent Dispatch.',
    count: `SELECT COUNT(*)::int AS n FROM sales_area_assignments WHERE sales_agent_id = $1 AND status = 'In Progress'`,
  },
  {
    key: 'openPurchaseRequests',
    roles: ['sales_staff'],
    kind: 'reassign',
    label: 'Customer purchase requests awaiting this agent\'s review',
    resolution: 'Choose another sales agent to review these requests.',
    count: `SELECT COUNT(*)::int AS n FROM purchase_requests WHERE sales_agent_id = $1 AND status IN ('Pending', 'In Review')`,
    reassign: `UPDATE purchase_requests SET sales_agent_id = $2, updated_at = NOW()
               WHERE sales_agent_id = $1 AND status IN ('Pending', 'In Review')`,
  },
  {
    key: 'creditRevisions',
    roles: ['sales_staff'],
    kind: 'blocking',
    label: 'Credit reviews returned to this agent for revision',
    resolution: 'Have the agent resubmit them, or have the Branch Manager reject them in Credit Investigation.',
    count: `SELECT COUNT(*)::int AS n FROM credit_investigations WHERE submitted_by = $1 AND status = 'Revision Requested'`,
  },
  // Sales agents and collectors
  {
    key: 'pendingVisits',
    roles: ['sales_staff', 'collector'],
    kind: 'reassign',
    label: 'Scheduled field visits not yet completed',
    resolution: 'Choose another employee with the same role to take these visits.',
    count: `SELECT COUNT(*)::int AS n FROM field_visits WHERE user_id = $1 AND status = 'Pending'`,
    reassign: `UPDATE field_visits SET user_id = $2, updated_at = NOW() WHERE user_id = $1 AND status = 'Pending'`,
  },
  // Collectors
  {
    key: 'collectorCustomerBook',
    roles: ['collector'],
    kind: 'reassign',
    label: 'Active customers in this collector\'s collection book',
    resolution: 'Choose another collector in the same branch to take over this book.',
    count: `SELECT COUNT(*)::int AS n FROM customers WHERE account_manager_id = $1 AND status = 'Active'`,
    reassign: `UPDATE customers SET account_manager_id = $2, updated_at = NOW()
               WHERE account_manager_id = $1 AND status = 'Active'`,
  },
  {
    key: 'pendingRemittances',
    roles: ['collector'],
    kind: 'blocking',
    label: 'Collections recorded by this collector still awaiting review',
    resolution: 'Have the Branch Manager review these collections first so cash in transit is accounted for.',
    count: `SELECT COUNT(*)::int AS n FROM collection_payment WHERE collector_id = $1 AND status = 'Pending'`,
  },
  // Warehouse
  {
    key: 'openTransfers',
    roles: ['inventory_staff'],
    kind: 'blocking',
    label: 'Stock transfers this employee submitted or shipped that are still open',
    resolution: 'Complete, receive, or have the Branch Manager reject these transfers first.',
    count: `SELECT COUNT(*)::int AS n FROM inventory_transfers
            WHERE (submitted_by = $1 OR shipped_by = $1)
              AND status IN ('Pending Approval', 'Submitted', 'Approved', 'Shipped')`,
  },
  {
    key: 'openRestocks',
    roles: ['inventory_staff'],
    kind: 'blocking',
    label: 'Restock records still in draft or awaiting approval',
    resolution: 'Submit or discard drafts, and have the Branch Manager decide pending restocks.',
    count: `SELECT COUNT(*)::int AS n FROM restock_headers
            WHERE (recorded_by = $1 OR submitted_by = $1) AND status IN ('Draft', 'Pending Approval')`,
  },
  {
    key: 'openStockCounts',
    roles: ['inventory_staff'],
    kind: 'blocking',
    label: 'Stock count adjustments awaiting approval',
    resolution: 'Have the Branch Manager approve or reject these adjustments first.',
    count: `SELECT COUNT(*)::int AS n FROM stock_count_headers
            WHERE counted_by = $1 AND status IN ('Draft', 'Pending Approval')`,
  },
  // Branch managers (branch queues — the next manager inherits them)
  {
    key: 'branchCreditReviews',
    roles: ['branch_manager'],
    kind: 'handover',
    scope: 'branch',
    label: 'Credit reviews awaiting a Branch Manager decision',
    resolution: 'They stay in the branch approval queue for the next Branch Manager, or decide them first in the Approval Center.',
    count: `SELECT COUNT(*)::int AS n FROM credit_investigations WHERE branch_id = $1 AND status = 'Pending'`,
  },
  {
    key: 'branchTransfers',
    roles: ['branch_manager'],
    kind: 'handover',
    scope: 'branch',
    label: 'Stock transfers awaiting Branch Manager approval',
    resolution: 'They stay in the branch approval queue for the next Branch Manager.',
    count: `SELECT COUNT(*)::int AS n FROM inventory_transfers
            WHERE source_branch_id = $1 AND status IN ('Pending Approval', 'Submitted')`,
  },
  {
    key: 'branchRestocks',
    roles: ['branch_manager'],
    kind: 'handover',
    scope: 'branch',
    label: 'Restocks awaiting Branch Manager approval',
    resolution: 'They stay in the branch approval queue for the next Branch Manager.',
    count: `SELECT COUNT(*)::int AS n FROM restock_headers WHERE branch_id = $1 AND status = 'Pending Approval'`,
  },
  {
    key: 'branchStockCounts',
    roles: ['branch_manager'],
    kind: 'handover',
    scope: 'branch',
    label: 'Stock count adjustments awaiting Branch Manager approval',
    resolution: 'They stay in the branch approval queue for the next Branch Manager.',
    count: `SELECT COUNT(*)::int AS n FROM stock_count_headers WHERE branch_id = $1 AND status = 'Pending Approval'`,
  },
  {
    key: 'branchCollections',
    roles: ['branch_manager'],
    kind: 'handover',
    scope: 'branch',
    label: 'Collections awaiting Branch Manager review',
    resolution: 'They stay in the branch review queue for the next Branch Manager.',
    count: `SELECT COUNT(*)::int AS n FROM collection_payment WHERE branch_id = $1 AND status = 'Pending'`,
  },
  {
    key: 'branchSpecialRequests',
    roles: ['branch_manager'],
    kind: 'handover',
    scope: 'branch',
    label: 'Special collection requests awaiting approval',
    resolution: 'They stay in the branch approval queue for the next Branch Manager.',
    count: `SELECT COUNT(*)::int AS n FROM special_collection_requests WHERE branch_id = $1 AND status = 'Pending'`,
  },
  {
    key: 'managerAlerts',
    roles: ['branch_manager'],
    kind: 'handover',
    label: 'Open operational alerts assigned to this manager',
    resolution: 'They return to the unassigned branch alert queue.',
    count: `SELECT COUNT(*)::int AS n FROM operational_alerts WHERE assigned_to = $1 AND status = 'Open'`,
    release: `UPDATE operational_alerts SET assigned_to = NULL, assigned_at = NULL, updated_at = NOW()
              WHERE assigned_to = $1 AND status = 'Open'`,
  },
  // Staff alerts
  {
    key: 'staffAlerts',
    roles: ['inventory_staff', 'sales_staff', 'collector'],
    kind: 'reassign',
    label: 'Open operational alerts assigned to this employee',
    resolution: 'Choose another employee to take these alerts.',
    count: `SELECT COUNT(*)::int AS n FROM operational_alerts WHERE assigned_to = $1 AND status = 'Open'`,
    reassign: `UPDATE operational_alerts SET assigned_to = $2, assigned_at = NOW(), updated_at = NOW()
               WHERE assigned_to = $1 AND status = 'Open'`,
  },
];

async function safeCount(db, sql, params) {
  try {
    const result = await db.query(sql, params);
    return Number(result.rows[0]?.n) || 0;
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return 0;
    throw err;
  }
}

/**
 * @param {{ id: number, role_slug: string, branch_id: number|null }} user
 */
export async function loadUserDependencies(db, user) {
  const roleSlug = user?.role_slug;
  const checks = CHECKS.filter((check) => check.roles.includes(roleSlug));
  const items = [];
  for (const check of checks) {
    const param = check.scope === 'branch' ? user.branch_id : user.id;
    if (param == null) continue;
    const count = await safeCount(db, check.count, [param]);
    if (!count) continue;
    items.push({
      key: check.key,
      kind: check.kind,
      label: check.label,
      resolution: check.resolution,
      count,
    });
  }
  const totals = { reassign: 0, blocking: 0, handover: 0 };
  for (const item of items) totals[item.kind] += item.count;
  return { items, totals, hasAny: items.length > 0 };
}

/** Active employees who can take over this user's reassignable work. */
export async function listReassignmentCandidates(db, user) {
  if (!user?.branch_id || !['sales_staff', 'collector', 'inventory_staff'].includes(user.role_slug)) return [];
  const result = await db.query(
    `SELECT u.id, u.employee_id, u.first_name, u.middle_name, u.last_name
       FROM users u
      WHERE u.role_id = $1 AND u.branch_id = $2 AND u.status = 'Active' AND u.id <> $3
      ORDER BY LOWER(u.last_name), LOWER(u.first_name)`,
    [user.role_id, user.branch_id, user.id]
  );
  return result.rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id || null,
    name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' '),
  }));
}

export class DependencyResolutionError extends Error {
  constructor(message, status = 409, payload = {}) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Validate that open work can be resolved, then move it. Must run inside a transaction.
 * Returns a per-key summary of rows moved or released.
 */
export async function resolveUserDependencies(db, user, {
  reassignToUserId = null,
  acknowledgeHandover = false,
} = {}) {
  const deps = await loadUserDependencies(db, user);
  const blocking = deps.items.filter((item) => item.kind === 'blocking');
  const reassignable = deps.items.filter((item) => item.kind === 'reassign');
  const handover = deps.items.filter((item) => item.kind === 'handover');

  if (blocking.length) {
    throw new DependencyResolutionError(
      'This employee still has open work that must be finished or decided first.',
      409,
      { dependencies: deps, reason: 'blocking' }
    );
  }

  let target = null;
  if (reassignable.length) {
    if (!reassignToUserId) {
      throw new DependencyResolutionError(
        'Choose an employee to take over this account\'s open work.',
        409,
        { dependencies: deps, reason: 'reassignment_required' }
      );
    }
    const targetRes = await db.query(
      `SELECT u.id, u.status, u.role_id, u.branch_id, u.employee_id,
              TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name
         FROM users u WHERE u.id = $1`,
      [Number(reassignToUserId)]
    );
    target = targetRes.rows[0];
    if (
      !target
      || Number(target.id) === Number(user.id)
      || target.status !== 'Active'
      || Number(target.role_id) !== Number(user.role_id)
      || Number(target.branch_id) !== Number(user.branch_id)
    ) {
      throw new DependencyResolutionError(
        'The replacement must be a different active employee with the same role in the same branch.',
        400,
        { dependencies: deps, reason: 'invalid_reassignment_target' }
      );
    }
  }

  if (handover.length && !acknowledgeHandover) {
    throw new DependencyResolutionError(
      'Confirm that the branch approval queue will wait for the next Branch Manager.',
      409,
      { dependencies: deps, reason: 'handover_acknowledgement_required' }
    );
  }

  const moved = {};
  for (const item of reassignable) {
    const check = CHECKS.find((c) => c.key === item.key);
    try {
      const result = await db.query(check.reassign, [user.id, target.id]);
      moved[item.key] = result.rowCount;
    } catch (err) {
      if (err.code === '23505') {
        throw new DependencyResolutionError(
          `${target.name} already has a conflicting entry for "${item.label}". Resolve it in the branch module, then try again.`,
          409,
          { dependencies: deps, reason: 'reassignment_conflict' }
        );
      }
      throw err;
    }
  }
  for (const item of handover) {
    const check = CHECKS.find((c) => c.key === item.key);
    if (check.release) {
      const result = await db.query(check.release, [user.id]);
      moved[item.key] = result.rowCount;
    }
  }

  return { dependencies: deps, moved, target };
}
