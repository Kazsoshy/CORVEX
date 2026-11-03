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

/** Notify BM/OM that a sales agent updated customer profile fields. */
export async function notifyCustomerProfileUpdated(pool, {
  branchId,
  customerId,
  customerCode,
  customerName,
  actorName,
  changedFields = [],
}) {
  if (!branchId) return;
  const approvers = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug IN ('branch_manager', 'operating_manager')
       AND (r.slug = 'operating_manager' OR u.branch_id = $1)`,
    [branchId]
  );

  const code = customerCode || `#${customerId}`;
  const fieldList = changedFields.length ? changedFields.join(', ') : 'profile fields';
  const title = 'Customer profile updated';
  const message = `${actorName || 'A sales agent'} updated ${customerName || 'a customer'} (${code}): ${fieldList}. Review the customer profile when convenient.`;

  await Promise.all(
    approvers.rows.map((row) =>
      insertUserNotification(pool, {
        userId: row.id,
        title,
        message,
        category: 'Customer',
      })
    )
  );
}
