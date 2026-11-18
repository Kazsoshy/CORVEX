import { upsertOpenOperationalAlert, resolveAlertsBySourceKey } from './operationalAlerts.js';

export async function createBranchTransferRequest(client, {
  customerId,
  targetBranchId,
  requestedBy,
  reason = null,
}) {
  const customer = await client.query(
    `SELECT customer_id, branch_id, territory_id, account_manager_id, assigned_sales_agent_id, status, first_name, last_name
     FROM customers WHERE customer_id = $1 FOR UPDATE`,
    [customerId]
  );
  if (!customer.rows.length) {
    const err = new Error('Customer not found.');
    err.status = 404;
    throw err;
  }
  const row = customer.rows[0];
  if (Number(row.branch_id) === Number(targetBranchId)) {
    const err = new Error('Customer is already in the target branch.');
    err.status = 400;
    throw err;
  }
  if (String(row.status) === 'Pending Identity Review') {
    const err = new Error('Resolve identity review before requesting a branch transfer.');
    err.status = 400;
    throw err;
  }

  const open = await client.query(
    `SELECT transfer_id FROM customer_branch_transfers
     WHERE customer_id = $1 AND status IN ('Pending Source', 'Pending OM', 'Needs Revision')
     LIMIT 1`,
    [customerId]
  );
  if (open.rows.length) {
    const err = new Error('A branch transfer is already in progress for this customer.');
    err.status = 409;
    err.existingId = open.rows[0].transfer_id;
    throw err;
  }

  const target = await client.query(`SELECT id, name FROM branches WHERE id = $1`, [targetBranchId]);
  if (!target.rows.length) {
    const err = new Error('Target branch not found.');
    err.status = 400;
    throw err;
  }

  const inserted = await client.query(
    `INSERT INTO customer_branch_transfers (
       customer_id, source_branch_id, target_branch_id, status, reason, requested_by, snapshot_json
     ) VALUES ($1, $2, $3, 'Pending Source', $4, $5, $6::jsonb)
     RETURNING *`,
    [
      customerId,
      row.branch_id,
      targetBranchId,
      reason || null,
      requestedBy,
      JSON.stringify({
        before: {
          branch_id: row.branch_id,
          territory_id: row.territory_id,
          account_manager_id: row.account_manager_id,
          assigned_sales_agent_id: row.assigned_sales_agent_id,
          status: row.status,
        },
        customer_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      }),
    ]
  );
  const transfer = inserted.rows[0];

  await upsertOpenOperationalAlert(client, {
    branchId: row.branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Warning',
    title: `Branch transfer requested: ${[row.first_name, row.last_name].filter(Boolean).join(' ')}`,
    message: `A transfer to ${target.rows[0].name} needs Source Branch Manager initiation (territory + reason), then OM approval.`,
    sourceKey: `customer-branch-transfer:${transfer.transfer_id}`,
    entityType: 'customer_branch_transfer',
    entityId: transfer.transfer_id,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers&transferId=${transfer.transfer_id}`,
  });

  await upsertOpenOperationalAlert(client, {
    branchId: targetBranchId,
    alertType: 'Customer Branch Transfer',
    severity: 'Info',
    title: `Incoming transfer request: ${[row.first_name, row.last_name].filter(Boolean).join(' ')}`,
    message: 'A customer from another branch was requested for transfer into this branch. Waiting on Source BM and OM.',
    sourceKey: `customer-branch-transfer-target:${transfer.transfer_id}`,
    entityType: 'customer_branch_transfer',
    entityId: transfer.transfer_id,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers&transferId=${transfer.transfer_id}`,
  });

  return transfer;
}

export async function listBranchTransfers(db, {
  branchId = null,
  status = null,
  forOm = false,
  limit = 100,
} = {}) {
  const params = [];
  const conditions = [];
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  } else if (forOm) {
    conditions.push(`t.status IN ('Pending OM', 'Needs Revision')`);
  } else {
    conditions.push(`t.status IN ('Pending Source', 'Pending OM', 'Needs Revision')`);
  }
  if (branchId != null && !forOm) {
    params.push(Number(branchId));
    conditions.push(`(t.source_branch_id = $${params.length} OR t.target_branch_id = $${params.length})`);
  }
  params.push(Math.min(Number(limit) || 100, 200));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT t.*,
            c.customer_code, c.first_name, c.last_name, c.contact_phone, c.status AS customer_status,
            sb.name AS source_branch_name,
            tb.name AS target_branch_name,
            tr.territory_name AS target_territory_name,
            COALESCE(NULLIF(TRIM(req.full_name), ''), TRIM(CONCAT_WS(' ', req.first_name, req.last_name))) AS requester_name
     FROM customer_branch_transfers t
     JOIN customers c ON c.customer_id = t.customer_id
     LEFT JOIN branches sb ON sb.id = t.source_branch_id
     LEFT JOIN branches tb ON tb.id = t.target_branch_id
     LEFT JOIN territories tr ON tr.territory_id = t.target_territory_id
     LEFT JOIN users req ON req.id = t.requested_by
     ${where}
     ORDER BY t.created_at ASC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

/** Source BM completes territory + reason and submits to OM. */
export async function sourceBmSubmitTransfer(client, {
  transferId,
  sourceBmId,
  targetTerritoryId,
  reason,
}) {
  const existing = await client.query(
    `SELECT * FROM customer_branch_transfers WHERE transfer_id = $1 FOR UPDATE`,
    [transferId]
  );
  if (!existing.rows.length) {
    const err = new Error('Transfer request not found.');
    err.status = 404;
    throw err;
  }
  const row = existing.rows[0];
  if (!['Pending Source', 'Needs Revision'].includes(row.status)) {
    const err = new Error('Transfer is not awaiting Source Branch Manager action.');
    err.status = 400;
    throw err;
  }
  if (!targetTerritoryId) {
    const err = new Error('Target territory is required.');
    err.status = 400;
    throw err;
  }
  const terr = await client.query(
    `SELECT territory_id, branch_id, COALESCE(status, 'Active') AS status
     FROM territories WHERE territory_id = $1`,
    [targetTerritoryId]
  );
  if (!terr.rows.length || Number(terr.rows[0].branch_id) !== Number(row.target_branch_id)) {
    const err = new Error('Territory must belong to the receiving branch.');
    err.status = 400;
    throw err;
  }
  if (terr.rows[0].status !== 'Active') {
    const err = new Error('Target territory must be Active.');
    err.status = 400;
    throw err;
  }
  if (!String(reason || row.reason || '').trim()) {
    const err = new Error('Transfer reason is required.');
    err.status = 400;
    throw err;
  }

  const updated = await client.query(
    `UPDATE customer_branch_transfers
     SET target_territory_id = $2,
         reason = $3,
         source_bm_id = $4,
         status = 'Pending OM',
         revision_note = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE transfer_id = $1
     RETURNING *`,
    [transferId, targetTerritoryId, String(reason || row.reason).trim(), sourceBmId]
  );
  return updated.rows[0];
}

export async function omDecideTransfer(client, {
  transferId,
  decision,
  note,
  omUserId,
  assignedSalesAgentId = null,
}) {
  const existing = await client.query(
    `SELECT * FROM customer_branch_transfers WHERE transfer_id = $1 FOR UPDATE`,
    [transferId]
  );
  if (!existing.rows.length) {
    const err = new Error('Transfer request not found.');
    err.status = 404;
    throw err;
  }
  const row = existing.rows[0];
  if (row.status !== 'Pending OM') {
    const err = new Error('Transfer is not awaiting OM decision.');
    err.status = 400;
    throw err;
  }

  const normalized = String(decision || '').trim().toLowerCase();
  if (normalized === 'needs_revision' || normalized === 'revision') {
    const updated = await client.query(
      `UPDATE customer_branch_transfers
       SET status = 'Needs Revision',
           revision_note = $2,
           om_decided_by = $3,
           decided_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE transfer_id = $1
       RETURNING *`,
      [transferId, note || null, omUserId]
    );
    return { transfer: updated.rows[0], applied: false };
  }

  if (normalized === 'reject' || normalized === 'rejected') {
    const updated = await client.query(
      `UPDATE customer_branch_transfers
       SET status = 'Rejected',
           rejection_note = $2,
           om_decided_by = $3,
           decided_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE transfer_id = $1
       RETURNING *`,
      [transferId, note || null, omUserId]
    );
    await resolveAlertsBySourceKey(client, `customer-branch-transfer:${transferId}`, {
      resolvedBy: omUserId,
      resolutionNote: note || 'Branch transfer rejected.',
    });
    await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
      resolvedBy: omUserId,
      resolutionNote: note || 'Branch transfer rejected.',
    });
    return { transfer: updated.rows[0], applied: false };
  }

  if (normalized !== 'approve' && normalized !== 'approved') {
    const err = new Error('decision must be approve, reject, or needs_revision.');
    err.status = 400;
    throw err;
  }

  if (!row.target_territory_id) {
    const err = new Error('Cannot approve without a target territory.');
    err.status = 400;
    throw err;
  }

  const customer = await client.query(
    `SELECT * FROM customers WHERE customer_id = $1 FOR UPDATE`,
    [row.customer_id]
  );
  if (!customer.rows.length) {
    const err = new Error('Customer not found.');
    err.status = 404;
    throw err;
  }
  const before = customer.rows[0];

  await client.query(
    `UPDATE customers
     SET branch_id = $2,
         territory_id = $3,
         account_manager_id = NULL,
         assigned_sales_agent_id = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE customer_id = $1`,
    [
      row.customer_id,
      row.target_branch_id,
      row.target_territory_id,
      assignedSalesAgentId || row.requested_by || null,
    ]
  );

  // Portal user branch must update in the same TX — failure rolls back the whole transfer.
  if (before.user_id) {
    await client.query(
      `UPDATE users SET branch_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [before.user_id, row.target_branch_id]
    );
  }

  const updated = await client.query(
    `UPDATE customer_branch_transfers
     SET status = 'Approved',
         om_decided_by = $2,
         decided_at = CURRENT_TIMESTAMP,
         applied_at = CURRENT_TIMESTAMP,
         snapshot_json = snapshot_json || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE transfer_id = $1
     RETURNING *`,
    [
      transferId,
      omUserId,
      JSON.stringify({
        after: {
          branch_id: row.target_branch_id,
          territory_id: row.target_territory_id,
          assigned_sales_agent_id: assignedSalesAgentId || row.requested_by || null,
          account_manager_id: null,
          outstanding_balances_preserved: true,
          credit_restrictions_preserved: true,
        },
        approved_note: note || null,
      }),
    ]
  );

  await resolveAlertsBySourceKey(client, `customer-branch-transfer:${transferId}`, {
    resolvedBy: omUserId,
    resolutionNote: note || 'Branch transfer approved and applied.',
  });
  await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
    resolvedBy: omUserId,
    resolutionNote: note || 'Branch transfer approved and applied.',
  });

  await upsertOpenOperationalAlert(client, {
    branchId: row.target_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Info',
    title: 'Customer transferred into branch',
    message: `Customer #${row.customer_id} is now in this branch. Credit/overdue restrictions remain on the existing record.`,
    sourceKey: `customer-branch-transfer-done:${transferId}`,
    entityType: 'customer',
    entityId: row.customer_id,
    linkPath: `/branch-manager/customers?customerId=${row.customer_id}`,
  });

  await upsertOpenOperationalAlert(client, {
    branchId: row.source_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Info',
    title: 'Customer transferred out of branch',
    message: `Customer #${row.customer_id} was transferred to another branch. Historical invoices remain linked to this customer ID.`,
    sourceKey: `customer-branch-transfer-source-done:${transferId}`,
    entityType: 'customer',
    entityId: row.customer_id,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers`,
  });

  // Notify requesting SA's (receiving) branch that transfer completed.
  if (Number(row.target_branch_id) !== Number(row.source_branch_id)) {
    await upsertOpenOperationalAlert(client, {
      branchId: row.target_branch_id,
      alertType: 'Customer Branch Transfer',
      severity: 'Info',
      title: 'Branch transfer completed for Sales Agent',
      message: `Existing customer #${row.customer_id} is now available under the receiving branch. Do not register again.`,
      sourceKey: `customer-branch-transfer-sa:${transferId}`,
      entityType: 'customer',
      entityId: row.customer_id,
      linkPath: `/sales/customer-detail/${row.customer_id}?from=customers`,
    });
  }

  return { transfer: updated.rows[0], applied: true, customerId: row.customer_id };
}
