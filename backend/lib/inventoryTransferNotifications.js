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
    message += ' Source-branch warehouse can confirm shipment (stock leaves source). Destination receives separately.';
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
    title: 'Restock posted',
    message: `${restockRef} (${deliveryRef}): ${linesLabel}, +${totalQuantity} units posted to your branch stock.`,
    category: 'Restock',
  });
}

export async function notifyRestockSubmitted(pool, {
  branchId,
  restockRef,
  deliveryRef,
  lineCount = 1,
  totalQuantity,
  submitterName,
}) {
  const title = 'Restock approval required';
  const linesLabel = Number(lineCount) > 1 ? `${lineCount} products` : '1 product';
  const message = `${submitterName || 'Warehouse'} submitted ${restockRef} (${deliveryRef}): ${linesLabel}, +${totalQuantity} units. Review in Approval Center.`;
  await notifyApprovers(pool, { sourceBranchId: branchId, title, message });
}

export async function notifyRestockDecision(pool, {
  submitterId,
  restockRef,
  status,
  rejectionReason,
}) {
  if (!submitterId) return;
  const approved = status === 'Posted' || status === 'Approved';
  const title = approved ? 'Restock approved & posted' : 'Restock rejected';
  let message = approved
    ? `Restock ${restockRef} was approved and stock was posted.`
    : `Restock ${restockRef} was rejected.`;
  if (!approved && rejectionReason) message += ` Reason: ${rejectionReason}`;
  await insertUserNotification(pool, {
    userId: submitterId,
    title,
    message,
    category: 'Restock',
  });
}

export async function notifyStockCountSubmitted(pool, {
  branchId,
  countRef,
  discrepancyCount,
  submitterName,
}) {
  const title = 'Stock count approval required';
  const message = `${submitterName || 'Warehouse'} submitted ${countRef} with ${discrepancyCount} variance line(s). Review in Approval Center.`;
  await notifyApprovers(pool, { sourceBranchId: branchId, title, message });
}

export async function notifyStockCountDecision(pool, {
  submitterId,
  countRef,
  status,
  rejectionReason,
}) {
  if (!submitterId) return;
  const approved = status === 'Completed' || status === 'Approved';
  const title = approved ? 'Stock count approved' : 'Stock count rejected';
  let message = approved
    ? `Stock count ${countRef} was approved and inventory adjustments were posted.`
    : `Stock count ${countRef} was rejected.`;
  if (!approved && rejectionReason) message += ` Reason: ${rejectionReason}`;
  await insertUserNotification(pool, {
    userId: submitterId,
    title,
    message,
    category: 'Stock Count',
  });
}

export async function notifyTransferShipped(pool, {
  transferRef,
  productName,
  lineCount = 1,
  totalQuantity,
  destinationBranchId,
  sourceBranchName,
}) {
  const recipients = await pool.query(
    `SELECT DISTINCT u.id FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug = 'inventory_staff'
       AND u.branch_id = $1`,
    [destinationBranchId]
  );
  const linesLabel = Number(lineCount) > 1 ? `${lineCount} products` : productName;
  const qtyLabel = totalQuantity != null ? `, ${totalQuantity} units` : '';
  const fromLabel = sourceBranchName ? ` from ${sourceBranchName}` : '';
  const message = `Transfer ${transferRef} (${linesLabel}${qtyLabel}) shipped${fromLabel}. Confirm receipt to add stock.`;
  await Promise.all(
    recipients.rows.map((row) =>
      insertUserNotification(pool, {
        userId: row.id,
        title: 'Transfer ready to receive',
        message,
        category: 'Transfer',
      })
    )
  );
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
  const title = 'Transfer received';
  const linesLabel = Number(lineCount) > 1 ? `${lineCount} products` : productName;
  const qtyLabel = totalQuantity != null ? `, ${totalQuantity} units` : '';
  const message = `Transfer ${transferRef} (${linesLabel}${qtyLabel}) was received. Destination stock updated.`;
  await Promise.all(
    recipients.rows.map((row) =>
      insertUserNotification(pool, { userId: row.id, title, message, category: 'Transfer' })
    )
  );
}
