import { upsertOpenOperationalAlert, resolveAlertsBySourceKey } from './operationalAlerts.js';

export const OPEN_TRANSFER_STATUSES = [
  'Pending Receiving',
  'Pending Source',
  'Pending OM',
  'Returned to SA',
  'Needs Revision',
];

function cleanPart(value, max = 255) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function composeAddress(parts = {}) {
  return [
    parts.address_street,
    parts.address_barangay,
    parts.address_city,
    parts.address_province,
    parts.address_region,
  ].filter(Boolean).join(', ') || null;
}

function appendTimeline(snapshot, event) {
  const base = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const timeline = Array.isArray(base.timeline) ? [...base.timeline] : [];
  timeline.push({
    at: new Date().toISOString(),
    ...event,
  });
  return { ...base, timeline };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Suggest a receiving-branch territory from barangay / map pin. */
export async function suggestReceivingTerritory(client, {
  branchId,
  barangay = null,
  latitude = null,
  longitude = null,
  bufferMeters = 250,
} = {}) {
  const terr = await client.query(
    `SELECT territory_id, territory_name, barangay_name,
            latitude::float AS latitude, longitude::float AS longitude,
            COALESCE(radius_meters, 800) AS radius_meters
     FROM territories
     WHERE branch_id = $1 AND COALESCE(status, 'Active') = 'Active'`,
    [branchId]
  );
  const rows = terr.rows || [];
  if (!rows.length) {
    return { proposed_territory_id: null, classification: 'none', matches: [] };
  }

  const barangayKey = String(barangay || '').trim().toLowerCase();
  if (barangayKey) {
    const byBarangay = rows.filter((t) => String(t.barangay_name || '').toLowerCase() === barangayKey);
    if (byBarangay.length === 1) {
      return {
        proposed_territory_id: Number(byBarangay[0].territory_id),
        classification: 'barangay_exact',
        matches: byBarangay,
        confident: true,
      };
    }
    if (byBarangay.length > 1) {
      return {
        proposed_territory_id: null,
        classification: 'barangay_ambiguous',
        matches: byBarangay,
        confident: false,
      };
    }
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const scored = rows
      .filter((t) => Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude)))
      .map((t) => {
        const distance = haversineMeters(lat, lng, Number(t.latitude), Number(t.longitude));
        const radius = Number(t.radius_meters) || 800;
        return { ...t, distance_meters: Math.round(distance), inside: distance <= radius + bufferMeters };
      })
      .sort((a, b) => a.distance_meters - b.distance_meters);
    const inside = scored.filter((t) => t.inside);
    if (inside.length === 1) {
      return {
        proposed_territory_id: Number(inside[0].territory_id),
        classification: 'geo_inside',
        matches: inside,
        nearest: inside[0],
        confident: true,
      };
    }
    if (inside.length > 1) {
      return {
        proposed_territory_id: null,
        classification: 'geo_ambiguous',
        matches: inside,
        nearest: inside[0],
        confident: false,
      };
    }
    if (scored[0]) {
      return {
        proposed_territory_id: null,
        classification: 'outside',
        matches: [],
        nearest: scored[0],
        confident: false,
      };
    }
  }

  return { proposed_territory_id: null, classification: 'unknown', matches: [], confident: false };
}

async function assertTerritoryOnReceivingBranch(client, territoryId, targetBranchId) {
  if (!territoryId) {
    const err = new Error('Target territory is required.');
    err.status = 400;
    throw err;
  }
  const terr = await client.query(
    `SELECT territory_id, branch_id, COALESCE(status, 'Active') AS status
     FROM territories WHERE territory_id = $1`,
    [territoryId]
  );
  if (!terr.rows.length || Number(terr.rows[0].branch_id) !== Number(targetBranchId)) {
    const err = new Error('Territory must belong to the receiving branch.');
    err.status = 400;
    throw err;
  }
  if (terr.rows[0].status !== 'Active') {
    const err = new Error('Target territory must be Active.');
    err.status = 400;
    throw err;
  }
  return terr.rows[0];
}

/** Receiving-branch Active user with expected role slug (sales_staff | collector). */
async function assertStaffOnReceivingBranch(client, userId, targetBranchId, roleSlug, label) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error(`${label} is required.`);
    err.status = 400;
    throw err;
  }
  const result = await client.query(
    `SELECT u.id, u.branch_id, u.status, r.slug
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row || row.status !== 'Active') {
    const err = new Error(`${label} must be an Active user.`);
    err.status = 400;
    throw err;
  }
  if (Number(row.branch_id) !== Number(targetBranchId)) {
    const err = new Error(`${label} must belong to the receiving branch.`);
    err.status = 400;
    throw err;
  }
  if (String(row.slug) !== String(roleSlug)) {
    const err = new Error(`${label} must have role ${roleSlug}.`);
    err.status = 400;
    throw err;
  }
  return row;
}

const TRANSFER_SELECT = `SELECT t.*,
            c.customer_code, c.first_name, c.last_name, c.contact_phone, c.status AS customer_status,
            sb.name AS source_branch_name,
            tb.name AS target_branch_name,
            tr.territory_name AS target_territory_name,
            pt.territory_name AS proposed_territory_name,
            COALESCE(NULLIF(TRIM(req.full_name), ''), TRIM(CONCAT_WS(' ', req.first_name, req.last_name))) AS requester_name,
            COALESCE(NULLIF(TRIM(psa.full_name), ''), TRIM(CONCAT_WS(' ', psa.first_name, psa.last_name))) AS proposed_sales_agent_name,
            COALESCE(NULLIF(TRIM(pam.full_name), ''), TRIM(CONCAT_WS(' ', pam.first_name, pam.last_name))) AS proposed_account_manager_name
     FROM customer_branch_transfers t
     JOIN customers c ON c.customer_id = t.customer_id
     LEFT JOIN branches sb ON sb.id = t.source_branch_id
     LEFT JOIN branches tb ON tb.id = t.target_branch_id
     LEFT JOIN territories tr ON tr.territory_id = t.target_territory_id
     LEFT JOIN territories pt ON pt.territory_id = t.proposed_territory_id
     LEFT JOIN users req ON req.id = t.requested_by
     LEFT JOIN users psa ON psa.id = t.proposed_assigned_sales_agent_id
     LEFT JOIN users pam ON pam.id = t.proposed_account_manager_id`;

export async function getBranchTransferById(db, transferId) {
  const result = await db.query(
    `${TRANSFER_SELECT}
     WHERE t.transfer_id = $1`,
    [transferId]
  );
  return result.rows[0] || null;
}

export function deriveTransferProgress(transfer) {
  const status = String(transfer?.status || '');
  const steps = [
    { key: 'submitted', label: 'Transfer Request Submitted by SA' },
    { key: 'receiving', label: 'Receiving BM Territory and Staffing Confirmation' },
    { key: 'source', label: 'Source BM Account Review and Ownership Release' },
    { key: 'om', label: 'Pending OM Final Approval' },
    { key: 'processing', label: 'System Processing Transfer' },
    { key: 'completed', label: 'Transfer Completed' },
  ];
  let activeIndex = 0;
  if (status === 'Pending Receiving' || status === 'Returned to SA' || status === 'Needs Revision') {
    activeIndex = status === 'Pending Receiving' ? 1 : 0;
  } else if (status === 'Pending Source') activeIndex = 2;
  else if (status === 'Pending OM') activeIndex = 3;
  else if (status === 'Approved') activeIndex = 5;
  else if (status === 'Rejected' || status === 'Cancelled') activeIndex = -1;

  return {
    transfer_ref: transfer?.transfer_id != null ? `CBT-${transfer.transfer_id}` : null,
    steps: steps.map((step, index) => ({
      ...step,
      state: status === 'Approved'
        ? 'done'
        : (activeIndex < 0
          ? (index === 0 ? 'done' : 'blocked')
          : (index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending')),
    })),
    status,
    rejection_note: transfer?.rejection_note || null,
    revision_note: transfer?.revision_note || null,
  };
}

export async function findOpenBranchTransferForCustomer(db, customerId) {
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const open = await db.query(
    `SELECT *
     FROM customer_branch_transfers
     WHERE customer_id = $1
       AND status = ANY($2::text[])
     ORDER BY transfer_id DESC
     LIMIT 1`,
    [id, OPEN_TRANSFER_STATUSES]
  );
  return open.rows[0] || null;
}

function throwOpenTransferConflict(existing) {
  const err = new Error('A branch transfer is already in progress for this customer.');
  err.status = 409;
  err.code = 'TRANSFER_IN_PROGRESS';
  err.existingId = existing?.transfer_id || null;
  err.existingStatus = existing?.status || null;
  err.canResubmit = ['Returned to SA', 'Needs Revision'].includes(String(existing?.status || ''));
  throw err;
}

export async function createBranchTransferRequest(client, {
  customerId,
  targetBranchId,
  requestedBy,
  reason = null,
  location = {},
  proposedTerritoryId = null,
}) {
  const customer = await client.query(
    `SELECT customer_id, branch_id, territory_id, account_manager_id, assigned_sales_agent_id, status,
            first_name, last_name, customer_code
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

  const reasonText = cleanPart(reason, 2000);
  if (!reasonText) {
    const err = new Error('Transfer reason is required.');
    err.status = 400;
    throw err;
  }

  const addressParts = {
    address_region: cleanPart(location.address_region, 100),
    address_province: cleanPart(location.address_province, 100),
    address_city: cleanPart(location.address_city, 100),
    address_barangay: cleanPart(location.address_barangay, 100),
    address_street: cleanPart(location.address_street, 255),
  };
  if (!addressParts.address_province || !addressParts.address_city || !addressParts.address_barangay || !addressParts.address_street) {
    const err = new Error('Current customer location (province, city, barangay, street) is required.');
    err.status = 400;
    throw err;
  }
  const address = cleanPart(location.address, 500) || composeAddress(addressParts);
  const latitude = location.latitude != null && location.latitude !== '' ? Number(location.latitude) : null;
  const longitude = location.longitude != null && location.longitude !== '' ? Number(location.longitude) : null;

  const openExisting = await findOpenBranchTransferForCustomer(client, customerId);
  if (openExisting) {
    throwOpenTransferConflict(openExisting);
  }

  const target = await client.query(`SELECT id, name FROM branches WHERE id = $1`, [targetBranchId]);
  if (!target.rows.length) {
    const err = new Error('Target branch not found.');
    err.status = 400;
    throw err;
  }

  let proposedId = proposedTerritoryId ? Number(proposedTerritoryId) : null;
  const suggestion = await suggestReceivingTerritory(client, {
    branchId: targetBranchId,
    barangay: addressParts.address_barangay,
    latitude,
    longitude,
  });
  if (!proposedId && suggestion.confident && suggestion.proposed_territory_id) {
    proposedId = suggestion.proposed_territory_id;
  }
  if (proposedId) {
    await assertTerritoryOnReceivingBranch(client, proposedId, targetBranchId);
  }

  const snapshot = appendTimeline({
    before: {
      branch_id: row.branch_id,
      territory_id: row.territory_id,
      account_manager_id: row.account_manager_id,
      assigned_sales_agent_id: row.assigned_sales_agent_id,
      status: row.status,
    },
    customer_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    customer_code: row.customer_code || null,
    suggestion,
  }, {
    step: 'submitted',
    actor_id: requestedBy,
    note: 'SA submitted transfer request with current customer location.',
  });

  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO customer_branch_transfers (
         customer_id, source_branch_id, target_branch_id, status, reason, requested_by, snapshot_json,
         address_region, address_province, address_city, address_barangay, address_street, address,
         latitude, longitude, proposed_territory_id
       ) VALUES (
         $1, $2, $3, 'Pending Receiving', $4, $5, $6::jsonb,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15
       )
       RETURNING *`,
      [
        customerId,
        row.branch_id,
        targetBranchId,
        reasonText,
        requestedBy,
        JSON.stringify(snapshot),
        addressParts.address_region,
        addressParts.address_province,
        addressParts.address_city,
        addressParts.address_barangay,
        addressParts.address_street,
        address,
        Number.isFinite(latitude) ? latitude : null,
        Number.isFinite(longitude) ? longitude : null,
        proposedId,
      ]
    );
  } catch (insertErr) {
    // Race / index mismatch: never leak raw unique_violation to the client.
    if (insertErr?.code === '23505') {
      const raced = await findOpenBranchTransferForCustomer(client, customerId);
      throwOpenTransferConflict(raced || { transfer_id: null, status: null });
    }
    throw insertErr;
  }
  const transfer = inserted.rows[0];

  await upsertOpenOperationalAlert(client, {
    branchId: targetBranchId,
    alertType: 'Customer Branch Transfer',
    severity: 'Warning',
    title: `Incoming transfer — confirm territory & staffing: ${[row.first_name, row.last_name].filter(Boolean).join(' ')}`,
    message: 'Receiving Branch Manager must confirm territory and assign Sales Agent + Collector, then Source BM releases ownership.',
    sourceKey: `customer-branch-transfer-target:${transfer.transfer_id}`,
    entityType: 'customer_branch_transfer',
    entityId: transfer.transfer_id,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers&transferId=${transfer.transfer_id}`,
  });

  await upsertOpenOperationalAlert(client, {
    branchId: row.branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Informational',
    title: `Outgoing transfer requested: ${[row.first_name, row.last_name].filter(Boolean).join(' ')}`,
    message: `Transfer to ${target.rows[0].name} awaiting Receiving BM territory/staffing, then your ownership release.`,
    sourceKey: `customer-branch-transfer:${transfer.transfer_id}`,
    entityType: 'customer_branch_transfer',
    entityId: transfer.transfer_id,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers&transferId=${transfer.transfer_id}`,
  });

  return transfer;
}

export async function resubmitBranchTransferBySa(client, {
  transferId,
  requestedBy,
  reason = null,
  location = {},
  proposedTerritoryId = null,
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
  if (!['Returned to SA', 'Needs Revision'].includes(row.status)) {
    const err = new Error('Transfer is not awaiting Sales Agent correction.');
    err.status = 400;
    throw err;
  }
  if (Number(row.requested_by) !== Number(requestedBy)) {
    const err = new Error('Only the requesting Sales Agent can resubmit this transfer.');
    err.status = 403;
    throw err;
  }

  const reasonText = cleanPart(reason, 2000) || cleanPart(row.reason, 2000);
  if (!reasonText) {
    const err = new Error('Transfer reason is required.');
    err.status = 400;
    throw err;
  }
  const addressParts = {
    address_region: cleanPart(location.address_region, 100) || row.address_region,
    address_province: cleanPart(location.address_province, 100) || row.address_province,
    address_city: cleanPart(location.address_city, 100) || row.address_city,
    address_barangay: cleanPart(location.address_barangay, 100) || row.address_barangay,
    address_street: cleanPart(location.address_street, 255) || row.address_street,
  };
  if (!addressParts.address_province || !addressParts.address_city || !addressParts.address_barangay || !addressParts.address_street) {
    const err = new Error('Current customer location (province, city, barangay, street) is required.');
    err.status = 400;
    throw err;
  }
  const address = cleanPart(location.address, 500) || composeAddress(addressParts);
  const latitude = location.latitude != null && location.latitude !== ''
    ? Number(location.latitude)
    : (row.latitude != null ? Number(row.latitude) : null);
  const longitude = location.longitude != null && location.longitude !== ''
    ? Number(location.longitude)
    : (row.longitude != null ? Number(row.longitude) : null);

  let proposedId = proposedTerritoryId ? Number(proposedTerritoryId) : null;
  const suggestion = await suggestReceivingTerritory(client, {
    branchId: row.target_branch_id,
    barangay: addressParts.address_barangay,
    latitude,
    longitude,
  });
  if (!proposedId && suggestion.confident && suggestion.proposed_territory_id) {
    proposedId = suggestion.proposed_territory_id;
  }

  const snapshot = appendTimeline(row.snapshot_json, {
    step: 'sa_resubmit',
    actor_id: requestedBy,
    note: 'SA corrected location and resubmitted.',
  });

  const updated = await client.query(
    `UPDATE customer_branch_transfers
     SET status = 'Pending Receiving',
         reason = $2,
         revision_note = NULL,
         address_region = $3,
         address_province = $4,
         address_city = $5,
         address_barangay = $6,
         address_street = $7,
         address = $8,
         latitude = $9,
         longitude = $10,
         proposed_territory_id = $11,
         target_territory_id = NULL,
         receiving_bm_id = NULL,
         source_bm_id = NULL,
         source_release_note = NULL,
         proposed_assigned_sales_agent_id = NULL,
         proposed_account_manager_id = NULL,
         snapshot_json = $12::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE transfer_id = $1
     RETURNING *`,
    [
      transferId,
      reasonText,
      addressParts.address_region,
      addressParts.address_province,
      addressParts.address_city,
      addressParts.address_barangay,
      addressParts.address_street,
      address,
      Number.isFinite(latitude) ? latitude : null,
      Number.isFinite(longitude) ? longitude : null,
      proposedId,
      JSON.stringify(snapshot),
    ]
  );

  await upsertOpenOperationalAlert(client, {
    branchId: row.target_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Warning',
    title: `Incoming transfer resubmitted — confirm territory & staffing`,
    message: 'Sales Agent corrected location. Receiving BM must re-confirm territory and assign Sales Agent + Collector.',
    sourceKey: `customer-branch-transfer-target:${transferId}`,
    entityType: 'customer_branch_transfer',
    entityId: transferId,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers&transferId=${transferId}`,
  });

  return updated.rows[0];
}

export async function listBranchTransfers(db, {
  branchId = null,
  status = null,
  forOm = false,
  requestedBy = null,
  limit = 100,
} = {}) {
  const params = [];
  const conditions = [];
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  } else if (forOm) {
    conditions.push(`t.status IN ('Pending OM', 'Returned to SA', 'Needs Revision')`);
  } else if (requestedBy != null) {
    params.push(Number(requestedBy));
    conditions.push(`t.requested_by = $${params.length}`);
    conditions.push(`t.status = ANY($${params.length + 1}::text[])`);
    params.push(OPEN_TRANSFER_STATUSES.concat(['Approved', 'Rejected']));
  } else {
    conditions.push(`t.status = ANY($${params.length + 1}::text[])`);
    params.push(OPEN_TRANSFER_STATUSES);
  }
  if (branchId != null && !forOm && requestedBy == null) {
    params.push(Number(branchId));
    conditions.push(`(t.source_branch_id = $${params.length} OR t.target_branch_id = $${params.length})`);
  }
  params.push(Math.min(Number(limit) || 100, 200));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.query(
    `${TRANSFER_SELECT}
     ${where}
     ORDER BY t.created_at ASC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

/** Receiving BM confirms territory + staffing, or returns location to SA. */
export async function receivingBmSubmitTransfer(client, {
  transferId,
  receivingBmId,
  decision,
  targetTerritoryId = null,
  assignedSalesAgentId = null,
  accountManagerId = null,
  note = null,
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
  if (row.status !== 'Pending Receiving') {
    const err = new Error('Transfer is not awaiting Receiving Branch Manager action.');
    err.status = 400;
    throw err;
  }

  const normalized = String(decision || '').trim().toLowerCase();
  if (normalized === 'return' || normalized === 'needs_revision' || normalized === 'revision') {
    if (!cleanPart(note, 2000)) {
      const err = new Error('A return reason is required.');
      err.status = 400;
      throw err;
    }
    const snapshot = appendTimeline(row.snapshot_json, {
      step: 'receiving_return',
      actor_id: receivingBmId,
      note,
    });
    const updated = await client.query(
      `UPDATE customer_branch_transfers
       SET status = 'Returned to SA',
           revision_note = $2,
           receiving_bm_id = $3,
           proposed_assigned_sales_agent_id = NULL,
           proposed_account_manager_id = NULL,
           target_territory_id = NULL,
           snapshot_json = $4::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE transfer_id = $1
       RETURNING *`,
      [transferId, cleanPart(note, 2000), receivingBmId, JSON.stringify(snapshot)]
    );
    await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
      resolvedBy: receivingBmId,
      resolutionNote: note || 'Returned to SA for location correction.',
    });
    return updated.rows[0];
  }

  if (normalized !== 'confirm' && normalized !== 'approve' && normalized !== 'submit') {
    const err = new Error('decision must be confirm or return.');
    err.status = 400;
    throw err;
  }

  const territoryId = Number(targetTerritoryId || row.proposed_territory_id || row.target_territory_id);
  await assertTerritoryOnReceivingBranch(client, territoryId, row.target_branch_id);

  const salesAgentId = Number(
    assignedSalesAgentId || row.proposed_assigned_sales_agent_id || row.requested_by
  );
  const collectorId = Number(accountManagerId || row.proposed_account_manager_id);
  await assertStaffOnReceivingBranch(
    client,
    salesAgentId,
    row.target_branch_id,
    'sales_staff',
    'Receiving Sales Agent'
  );
  await assertStaffOnReceivingBranch(
    client,
    collectorId,
    row.target_branch_id,
    'collector',
    'Receiving Collector'
  );

  const snapshot = appendTimeline(row.snapshot_json, {
    step: 'receiving_confirm',
    actor_id: receivingBmId,
    note: note || 'Receiving BM confirmed territory and staffing.',
    territory_id: territoryId,
    assigned_sales_agent_id: salesAgentId,
    account_manager_id: collectorId,
  });

  const updated = await client.query(
    `UPDATE customer_branch_transfers
     SET target_territory_id = $2,
         proposed_territory_id = COALESCE(proposed_territory_id, $2),
         receiving_bm_id = $3,
         proposed_assigned_sales_agent_id = $4,
         proposed_account_manager_id = $5,
         status = 'Pending Source',
         revision_note = NULL,
         snapshot_json = $6::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE transfer_id = $1
     RETURNING *`,
    [transferId, territoryId, receivingBmId, salesAgentId, collectorId, JSON.stringify(snapshot)]
  );

  await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
    resolvedBy: receivingBmId,
    resolutionNote: 'Receiving BM confirmed territory and staffing.',
  });
  await upsertOpenOperationalAlert(client, {
    branchId: row.source_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Warning',
    title: 'Release ownership — branch transfer ready',
    message: 'Receiving BM confirmed territory and staffing. Source BM must release ownership or reject.',
    sourceKey: `customer-branch-transfer:${transferId}`,
    entityType: 'customer_branch_transfer',
    entityId: transferId,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers&transferId=${transferId}`,
  });

  return updated.rows[0];
}

/** Source BM releases ownership only (no territory selection). */
export async function sourceBmSubmitTransfer(client, {
  transferId,
  sourceBmId,
  decision = 'release',
  note = null,
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
  if (row.status !== 'Pending Source') {
    const err = new Error('Transfer is not awaiting Source Branch Manager action.');
    err.status = 400;
    throw err;
  }
  if (!row.target_territory_id) {
    const err = new Error('Receiving BM must confirm territory before ownership release.');
    err.status = 400;
    throw err;
  }

  const normalized = String(decision || 'release').trim().toLowerCase();
  if (normalized === 'reject' || normalized === 'rejected') {
    if (!cleanPart(note, 2000)) {
      const err = new Error('A rejection reason is required.');
      err.status = 400;
      throw err;
    }
    const snapshot = appendTimeline(row.snapshot_json, {
      step: 'source_reject',
      actor_id: sourceBmId,
      note,
    });
    const updated = await client.query(
      `UPDATE customer_branch_transfers
       SET status = 'Rejected',
           rejection_note = $2,
           source_bm_id = $3,
           source_release_note = $2,
           decided_at = CURRENT_TIMESTAMP,
           snapshot_json = $4::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE transfer_id = $1
       RETURNING *`,
      [transferId, cleanPart(note, 2000), sourceBmId, JSON.stringify(snapshot)]
    );
    await resolveAlertsBySourceKey(client, `customer-branch-transfer:${transferId}`, {
      resolvedBy: sourceBmId,
      resolutionNote: note || 'Branch transfer rejected by Source BM.',
    });
    await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
      resolvedBy: sourceBmId,
      resolutionNote: note || 'Branch transfer rejected by Source BM.',
    });
    await resolveAlertsBySourceKey(client, `customer-branch-transfer-om:${transferId}`, {
      resolvedBy: sourceBmId,
      resolutionNote: note || 'Branch transfer rejected by Source BM.',
    });
    return updated.rows[0];
  }

  if (normalized === 'return' || normalized === 'needs_revision' || normalized === 'revision') {
    const err = new Error(
      'Source Branch Manager cannot return to SA. Location revisions are handled by Receiving BM before ownership release.'
    );
    err.status = 400;
    throw err;
  }

  const snapshot = appendTimeline(row.snapshot_json, {
    step: 'source_release',
    actor_id: sourceBmId,
    note: note || 'Source BM released ownership.',
  });

  const updated = await client.query(
    `UPDATE customer_branch_transfers
     SET source_bm_id = $2,
         source_release_note = $3,
         status = 'Pending OM',
         revision_note = NULL,
         snapshot_json = $4::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE transfer_id = $1
     RETURNING *`,
    [transferId, sourceBmId, cleanPart(note, 2000), JSON.stringify(snapshot)]
  );

  await resolveAlertsBySourceKey(client, `customer-branch-transfer:${transferId}`, {
    resolvedBy: sourceBmId,
    resolutionNote: note || 'Source BM released ownership.',
  });
  await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
    resolvedBy: sourceBmId,
    resolutionNote: note || 'Source BM released ownership.',
  });
  await upsertOpenOperationalAlert(client, {
    branchId: row.target_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Informational',
    title: 'Branch transfer awaiting OM approval',
    message: 'Source BM released ownership. Operating Manager must approve or reject.',
    sourceKey: `customer-branch-transfer-om:${transferId}`,
    entityType: 'customer_branch_transfer',
    entityId: transferId,
    linkPath: `/operating-manager/operations/approval-center?tab=branch-transfers&transferId=${transferId}`,
  });

  return updated.rows[0];
}

export async function omDecideTransfer(client, {
  transferId,
  decision,
  note,
  omUserId,
  assignedSalesAgentId = null,
  accountManagerId = null,
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
  if (normalized === 'needs_revision' || normalized === 'revision' || normalized === 'return') {
    const err = new Error(
      'Operating Manager cannot return to SA. Location revisions are handled by Receiving BM before ownership release. Use Reject to stop the transfer.'
    );
    err.status = 400;
    throw err;
  }

  if (normalized === 'reject' || normalized === 'rejected') {
    const snapshot = appendTimeline(row.snapshot_json, {
      step: 'om_reject',
      actor_id: omUserId,
      note,
    });
    const updated = await client.query(
      `UPDATE customer_branch_transfers
       SET status = 'Rejected',
           rejection_note = $2,
           om_decided_by = $3,
           decided_at = CURRENT_TIMESTAMP,
           snapshot_json = $4::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE transfer_id = $1
       RETURNING *`,
      [transferId, note || null, omUserId, JSON.stringify(snapshot)]
    );
    await resolveAlertsBySourceKey(client, `customer-branch-transfer:${transferId}`, {
      resolvedBy: omUserId,
      resolutionNote: note || 'Branch transfer rejected.',
    });
    await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
      resolvedBy: omUserId,
      resolutionNote: note || 'Branch transfer rejected.',
    });
    await resolveAlertsBySourceKey(client, `customer-branch-transfer-om:${transferId}`, {
      resolvedBy: omUserId,
      resolutionNote: note || 'Branch transfer rejected.',
    });
    return { transfer: updated.rows[0], applied: false };
  }

  if (normalized !== 'approve' && normalized !== 'approved') {
    const err = new Error('decision must be approve or reject.');
    err.status = 400;
    throw err;
  }

  if (!row.target_territory_id) {
    const err = new Error('Cannot approve without a target territory.');
    err.status = 400;
    throw err;
  }

  const assignedSa = Number(
    assignedSalesAgentId || row.proposed_assigned_sales_agent_id || row.requested_by
  );
  const assignedCollector = Number(
    accountManagerId || row.proposed_account_manager_id
  );
  await assertStaffOnReceivingBranch(
    client,
    assignedSa,
    row.target_branch_id,
    'sales_staff',
    'Receiving Sales Agent'
  );
  await assertStaffOnReceivingBranch(
    client,
    assignedCollector,
    row.target_branch_id,
    'collector',
    'Receiving Collector'
  );

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
         account_manager_id = $4,
         assigned_sales_agent_id = $5,
         address_region = COALESCE($6, address_region),
         address_province = COALESCE($7, address_province),
         address_city = COALESCE($8, address_city),
         address_barangay = COALESCE($9, address_barangay),
         address_street = COALESCE($10, address_street),
         address = COALESCE($11, address),
         latitude = COALESCE($12, latitude),
         longitude = COALESCE($13, longitude),
         updated_at = CURRENT_TIMESTAMP
     WHERE customer_id = $1`,
    [
      row.customer_id,
      row.target_branch_id,
      row.target_territory_id,
      assignedCollector,
      assignedSa,
      row.address_region,
      row.address_province,
      row.address_city,
      row.address_barangay,
      row.address_street,
      row.address,
      row.latitude,
      row.longitude,
    ]
  );

  if (before.user_id) {
    await client.query(
      `UPDATE users SET branch_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [before.user_id, row.target_branch_id]
    );
  }

  const snapshot = appendTimeline(
    {
      ...(row.snapshot_json || {}),
      after: {
        branch_id: row.target_branch_id,
        territory_id: row.target_territory_id,
        assigned_sales_agent_id: assignedSa,
        account_manager_id: assignedCollector,
        outstanding_balances_preserved: true,
        credit_restrictions_preserved: true,
        address_updated_from_transfer: true,
      },
      approved_note: note || null,
    },
    {
      step: 'om_approve',
      actor_id: omUserId,
      note: note || 'OM approved and system applied transfer.',
    }
  );

  const updated = await client.query(
    `UPDATE customer_branch_transfers
     SET status = 'Approved',
         om_decided_by = $2,
         decided_at = CURRENT_TIMESTAMP,
         applied_at = CURRENT_TIMESTAMP,
         snapshot_json = $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE transfer_id = $1
     RETURNING *`,
    [transferId, omUserId, JSON.stringify(snapshot)]
  );

  await resolveAlertsBySourceKey(client, `customer-branch-transfer:${transferId}`, {
    resolvedBy: omUserId,
    resolutionNote: note || 'Branch transfer approved and applied.',
  });
  await resolveAlertsBySourceKey(client, `customer-branch-transfer-target:${transferId}`, {
    resolvedBy: omUserId,
    resolutionNote: note || 'Branch transfer approved and applied.',
  });
  await resolveAlertsBySourceKey(client, `customer-branch-transfer-om:${transferId}`, {
    resolvedBy: omUserId,
    resolutionNote: note || 'Branch transfer approved and applied.',
  });

  await upsertOpenOperationalAlert(client, {
    branchId: row.target_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Informational',
    title: 'Customer transferred into branch',
    message: `Customer #${row.customer_id} is now in this branch with assigned SA and collector. Credit/overdue restrictions remain on the existing record.`,
    sourceKey: `customer-branch-transfer-done:${transferId}`,
    entityType: 'customer',
    entityId: row.customer_id,
    linkPath: `/branch-manager/customers?customerId=${row.customer_id}`,
  });

  await upsertOpenOperationalAlert(client, {
    branchId: row.source_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Informational',
    title: 'Customer transferred out of branch',
    message: `Customer #${row.customer_id} was transferred to another branch. Historical invoices remain linked to this customer ID.`,
    sourceKey: `customer-branch-transfer-source-done:${transferId}`,
    entityType: 'customer',
    entityId: row.customer_id,
    linkPath: `/branch-manager/approval-center?tab=branch-transfers`,
  });

  await upsertOpenOperationalAlert(client, {
    branchId: row.target_branch_id,
    alertType: 'Customer Branch Transfer',
    severity: 'Informational',
    title: 'Branch transfer completed for Sales Agent',
    message: `Existing customer #${row.customer_id} is now available under the receiving branch. Do not register again.`,
    sourceKey: `customer-branch-transfer-sa:${transferId}`,
    entityType: 'customer',
    entityId: row.customer_id,
    linkPath: `/sales/customer-detail/${row.customer_id}?from=customers`,
  });

  return { transfer: updated.rows[0], applied: true, customerId: row.customer_id };
}
