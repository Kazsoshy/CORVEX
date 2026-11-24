import { insertUserNotification } from './creditInvestigationNotifications.js';

async function notifyUsersByIds(pool, userIds, payload) {
  const ids = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  await Promise.all(
    ids.map((userId) => insertUserNotification(pool, { ...payload, userId }))
  );
}

async function branchManagerIds(pool, branchId) {
  const result = await pool.query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug = 'branch_manager'
       AND u.branch_id = $1`,
    [branchId]
  );
  return result.rows.map((row) => row.id);
}

async function operatingManagerIds(pool) {
  const result = await pool.query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug IN ('operating_manager', 'super_admin')`
  );
  return result.rows.map((row) => row.id);
}

export async function notifyBranchTransferSubmitted(pool, {
  transferId,
  customerName,
  targetBranchId,
  sourceBranchId,
  resubmit = false,
}) {
  const receiving = await branchManagerIds(pool, targetBranchId);
  const oms = await operatingManagerIds(pool);
  const title = resubmit ? 'Branch transfer resubmitted' : 'New branch transfer request';
  const message = resubmit
    ? `${customerName} transfer #${transferId} was corrected and returned to Receiving BM for territory/staffing.`
    : `${customerName} transfer #${transferId} needs Receiving BM territory confirmation and staffing.`;
  await notifyUsersByIds(pool, [...receiving, ...oms], {
    title,
    message,
    category: 'Customer',
    relatedEntity: 'branch_transfer',
    relatedId: transferId,
  });
  // Informational heads-up for source BM (no action yet).
  const source = await branchManagerIds(pool, sourceBranchId);
  await notifyUsersByIds(pool, source, {
    title: resubmit ? 'Outgoing transfer updated' : 'Outgoing transfer requested',
    message: `${customerName} transfer #${transferId} is awaiting Receiving BM, then your ownership release.`,
    category: 'Customer',
    relatedEntity: 'branch_transfer',
    relatedId: transferId,
  });
}

export async function notifyBranchTransferReturnedToSa(pool, {
  transferId,
  customerName,
  requestedBy,
  note = null,
}) {
  if (!requestedBy) return;
  await insertUserNotification(pool, {
    userId: requestedBy,
    title: 'Branch transfer returned',
    message: note
      ? `${customerName} transfer #${transferId} was returned for location correction. Reason: ${note}`
      : `${customerName} transfer #${transferId} was returned for location correction.`,
    category: 'Customer',
    relatedEntity: 'branch_transfer',
    relatedId: transferId,
  });
}

export async function notifyBranchTransferPendingSource(pool, {
  transferId,
  customerName,
  sourceBranchId,
}) {
  const source = await branchManagerIds(pool, sourceBranchId);
  await notifyUsersByIds(pool, source, {
    title: 'Release ownership — branch transfer',
    message: `${customerName} transfer #${transferId} is ready for Source BM ownership release.`,
    category: 'Customer',
    relatedEntity: 'branch_transfer',
    relatedId: transferId,
  });
}

export async function notifyBranchTransferPendingOm(pool, {
  transferId,
  customerName,
}) {
  const oms = await operatingManagerIds(pool);
  await notifyUsersByIds(pool, oms, {
    title: 'Branch transfer awaiting OM approval',
    message: `${customerName} transfer #${transferId} is ready for final OM approve or reject.`,
    category: 'Customer',
    relatedEntity: 'branch_transfer',
    relatedId: transferId,
  });
}

export async function notifyBranchTransferRejected(pool, {
  transferId,
  customerName,
  requestedBy,
  note = null,
}) {
  if (!requestedBy) return;
  await insertUserNotification(pool, {
    userId: requestedBy,
    title: 'Branch transfer rejected',
    message: note
      ? `${customerName} transfer #${transferId} was rejected. Reason: ${note}`
      : `${customerName} transfer #${transferId} was rejected. Customer remains in the source branch.`,
    category: 'Customer',
    relatedEntity: 'branch_transfer',
    relatedId: transferId,
  });
}

export async function notifyBranchTransferApproved(pool, {
  transferId,
  customerName,
  requestedBy,
  targetBranchId,
}) {
  if (requestedBy) {
    await insertUserNotification(pool, {
      userId: requestedBy,
      title: 'Branch transfer approved',
      message: `${customerName} transfer #${transferId} was approved. Open the existing customer profile — do not register again.`,
      category: 'Customer',
      relatedEntity: 'branch_transfer',
      relatedId: transferId,
    });
  }
  const receiving = await branchManagerIds(pool, targetBranchId);
  await notifyUsersByIds(pool, receiving, {
    title: 'Customer transferred into branch',
    message: `${customerName} (#${transferId}) is now in your branch with assigned SA and collector from the transfer.`,
    category: 'Customer',
    relatedEntity: 'branch_transfer',
    relatedId: transferId,
  });
}
