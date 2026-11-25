import { insertUserNotification } from './creditInvestigationNotifications.js';

export async function writeCustomerAudit(pool, {
  userId,
  userName,
  action,
  statusDetails,
  ipAddress = '127.0.0.1',
}) {
  const detail = String(statusDetails || action || 'Customer updated').slice(0, 150);
  await pool.query(
    `INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [userId, userName || 'System', String(action || 'Customer profile updated').slice(0, 150), ipAddress, detail]
  );
}

async function listBranchManagersAndOm(pool, branchId) {
  if (branchId == null) return [];
  const approvers = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug IN ('branch_manager', 'operating_manager')
       AND (r.slug = 'operating_manager' OR u.branch_id = $1)`,
    [branchId]
  );
  return approvers.rows.map((row) => row.id);
}

/** Notify BM/OM that a sales agent updated customer profile fields. */
export async function notifyCustomerProfileUpdated(pool, {
  branchId,
  customerId,
  customerCode,
  customerName,
  actorName,
  changedFields = [],
}) {
  const userIds = await listBranchManagersAndOm(pool, branchId);
  if (!userIds.length) return;

  const code = customerCode || `#${customerId}`;
  const fieldList = changedFields.length ? changedFields.join(', ') : 'profile fields';
  const title = 'Customer profile updated';
  const message = `${actorName || 'A sales agent'} updated ${customerName || 'a customer'} (${code}): ${fieldList}. Review the customer profile when convenient.`;

  await Promise.all(
    userIds.map((userId) =>
      insertUserNotification(pool, {
        userId,
        title,
        message,
        category: 'Customer',
        relatedEntity: 'customer',
        relatedId: customerId,
      })
    )
  );
}

/** Inform BM/OM that a new Active customer was created (no approval gate). */
export async function notifyCustomerCreated(pool, {
  branchId,
  customerId,
  customerCode,
  customerName,
  actorName,
}) {
  const userIds = await listBranchManagersAndOm(pool, branchId);
  if (!userIds.length) return;

  const code = customerCode || `#${customerId}`;
  const title = 'New customer registered';
  const message = `${actorName || 'A sales agent'} registered ${customerName || 'a customer'} (${code}). No action required — review the profile when convenient.`;

  await Promise.all(
    userIds.map((userId) =>
      insertUserNotification(pool, {
        userId,
        title,
        message,
        category: 'Customer',
        relatedEntity: 'customer',
        relatedId: customerId,
      })
    )
  );
}

/** BM must review a territory-exception registration. */
export async function notifyTerritoryReviewSubmitted(pool, {
  branchId,
  customerId,
  customerCode,
  customerName,
  actorName,
  note,
}) {
  const userIds = await listBranchManagersAndOm(pool, branchId);
  if (!userIds.length) return;

  const code = customerCode || `#${customerId}`;
  const noteBit = note ? ` Note: ${String(note).slice(0, 120)}` : '';
  const title = 'Territory exception review';
  const message = `${actorName || 'A sales agent'} registered ${customerName || 'a customer'} (${code}) outside territory coverage. Approve or reject in Approval Center (Territory / Identity).${noteBit}`;

  await Promise.all(
    userIds.map((userId) =>
      insertUserNotification(pool, {
        userId,
        title,
        message,
        category: 'Identity',
        relatedEntity: 'identity',
        relatedId: customerId,
      })
    )
  );
}

/** Tell the assigning SA the BM territory decision. */
export async function notifyTerritoryReviewDecided(pool, {
  salesAgentId,
  customerId,
  customerCode,
  customerName,
  approved,
  note,
  actorName,
}) {
  if (!salesAgentId) return;
  const code = customerCode || `#${customerId}`;
  const title = approved ? 'Territory exception approved' : 'Territory exception rejected';
  const message = approved
    ? `${actorName || 'Branch Manager'} approved ${customerName || 'your customer'} (${code}). The account is now Active for cash sales.`
    : `${actorName || 'Branch Manager'} declined ${customerName || 'your customer'} (${code}) — status Rejected. Fix address/territory and resubmit; do not create a new customer.${note ? ` Reason: ${String(note).slice(0, 120)}` : ''}`;

  await insertUserNotification(pool, {
    userId: salesAgentId,
    title,
    message,
    category: 'Customer',
    relatedEntity: 'customer',
    relatedId: customerId,
  });
}
