import { insertUserNotification } from './creditInvestigationNotifications.js';

async function notifyApprovers(pool, { sourceBranchId, title, message }) {
  const approvers = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug IN ('branch_manager', 'operating_manager')
       AND (r.slug = 'operating_manager' OR u.branch_id = $1)`,
    [sourceBranchId]
  );
  await Promise.all(
    approvers.rows.map((row) =>
      insertUserNotification(pool, { userId: row.id, title, message, category: 'Transfer' })
    )
  );
}

/** Notify branch managers (source branch) and operating managers when a transfer is submitted. */
export async function notifyTransferSubmitted(pool, {
  sourceBranchId,
  transferRef,
  productName,
  quantity,
  lineCount = 1,
  submitterName,
}) {
  const title = 'Transfer approval required';
  const linesLabel = Number(lineCount) > 1 ? `${lineCount} products` : productName;
  const message = `${submitterName} requested transfer ${transferRef} (${linesLabel}, ${quantity} units). Review in Approval Center.`;
  await notifyApprovers(pool, { sourceBranchId, title, message });
}

export async function notifyTransferDecision(pool, {
  submitterId,
  transferRef,
  status,
  rejectionReason,
}) {
  if (!submitterId) return;
  const title = status === 'Approved' ? 'Transfer approved' : 'Transfer rejected';
  let message = `Transfer ${transferRef} was ${status.toLowerCase()}.`;
  if (status === 'Rejected' && rejectionReason) message += ` Reason: ${rejectionReason}`;
  if (status === 'Approved') {
    message += ' Source-branch warehouse can confirm shipment to complete stock movement.';
  }
  await insertUserNotification(pool, {
    userId: submitterId,
    title,
    message,
    category: 'Transfer',
  });
}

/** Confirmation for the warehouse user who recorded a restock (not an approval ping). */
export async function notifyRestockRecorded(pool, {
  userId,
  restockRef,
  deliveryRef,
  lineCount = 1,
  totalQuantity,
}) {
  if (!userId) return;
  const linesLabel = Number(lineCount) > 1 ? `${lineCount} products` : '1 product';
  await insertUserNotification(pool, {
    userId,
    title: 'Restock recorded',
    message: `${restockRef} (${deliveryRef}): ${linesLabel}, +${totalQuantity} units saved to your branch stock.`,
    category: 'Restock',
  });
}

export async function notifyTransferCompleted(pool, {
  transferRef,
  productName,
  lineCount = 1,
  totalQuantity,
  destinationBranchId,
}) {
  const recipients = await pool.query(
    `SELECT DISTINCT u.id FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND (
         (r.slug IN ('branch_manager', 'inventory_staff') AND u.branch_id = $1)
         OR r.slug = 'operating_manager'
       )`,
    [destinationBranchId]
  );
  const title = 'Transfer completed';
  const linesLabel = Number(lineCount) > 1 ? `${lineCount} products` : productName;
  const qtyLabel = totalQuantity != null ? `, ${totalQuantity} units` : '';
  const message = `Transfer ${transferRef} (${linesLabel}${qtyLabel}) was completed. Stock updated at destination branch.`;
  await Promise.all(
    recipients.rows.map((row) =>
      insertUserNotification(pool, { userId: row.id, title, message, category: 'Transfer' })
    )
  );
}
