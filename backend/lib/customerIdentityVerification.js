import crypto from 'crypto';
import { limitedMatchCard, digitsOnly } from './customerDuplicateLookup.js';
import { upsertOpenOperationalAlert, resolveAlertsBySourceKey } from './operationalAlerts.js';

const CLEARANCE_HOURS = 48;
export const OPEN_IDENTITY_STATUSES = ['Pending', 'Needs Evidence', 'Transfer Linked'];

function parseCandidates(row) {
  const raw = row?.match_candidates_json;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

export async function findOpenIdentityForRequester(client, {
  requestedBy,
  phoneNorm = null,
  registrationAttemptKey = null,
}) {
  const params = [requestedBy];
  const conditions = [
    `requested_by = $1`,
    `status = ANY($${params.length + 1}::text[])`,
  ];
  params.push(OPEN_IDENTITY_STATUSES);

  if (phoneNorm) {
    params.push(phoneNorm);
    conditions.push(`search_phone_normalized = $${params.length}`);
  }
  if (registrationAttemptKey) {
    params.push(registrationAttemptKey);
    conditions.push(`registration_attempt_key = $${params.length}`);
  }

  const result = await client.query(
    `SELECT * FROM customer_identity_verifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT 1`,
    params
  );
  return result.rows[0] || null;
}

export async function createIdentityVerification(client, {
  branchId,
  requestedBy,
  searchPayload = {},
  proposedRegistration = {},
  matches = [],
  registrationAttemptKey = null,
}) {
  const possibleOnly = (matches || []).filter((m) => m.match_tier === 'possible');
  if (!possibleOnly.length) {
    const err = new Error(
      'Exact matches do not require Branch Manager identity verification. Open the existing profile or request a branch transfer.'
    );
    err.status = 400;
    throw err;
  }

  const phoneNorm = digitsOnly(
    searchPayload.contact_phone
      || searchPayload.phone
      || proposedRegistration.contact_phone
      || ''
  );
  const attemptKey = registrationAttemptKey
    || searchPayload.registration_attempt_key
    || proposedRegistration.registration_attempt_key
    || null;

  const existing = await findOpenIdentityForRequester(client, {
    requestedBy,
    phoneNorm: phoneNorm || null,
    registrationAttemptKey: !phoneNorm ? attemptKey : null,
  });
  if (existing) {
    // Idempotent: return the open ticket instead of creating a duplicate.
    const err = new Error(
      'You already have a pending identity verification. Wait for the Branch Manager decision.'
    );
    err.status = 409;
    err.existingId = existing.verification_id;
    err.existingRow = existing;
    throw err;
  }

  const candidates = possibleOnly.map(limitedMatchCard);
  const primary = candidates[0] || null;
  const result = await client.query(
    `INSERT INTO customer_identity_verifications (
       branch_id, requested_by, status,
       search_payload_json, proposed_registration_json, match_candidates_json,
       primary_match_customer_id, search_phone_normalized, registration_attempt_key
     ) VALUES ($1, $2, 'Pending', $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8)
     RETURNING *`,
    [
      branchId,
      requestedBy,
      JSON.stringify(searchPayload || {}),
      JSON.stringify(proposedRegistration || {}),
      JSON.stringify(candidates),
      primary?.customer_id || null,
      phoneNorm || null,
      attemptKey || (phoneNorm ? `phone:${phoneNorm}` : crypto.randomUUID()),
    ]
  );
  const row = result.rows[0];
  await upsertOpenOperationalAlert(client, {
    branchId,
    alertType: 'Customer Identity Verification',
    severity: 'Warning',
    title: 'Duplicate identity verification requested',
    message: 'A Sales Agent requested Branch Manager review of a possible duplicate before registration.',
    sourceKey: `customer-identity-verification:${row.verification_id}`,
    entityType: 'identity_verification',
    entityId: row.verification_id,
    linkPath: `/branch-manager/approval-center?focus=identity&verificationId=${row.verification_id}`,
  });
  return row;
}

export async function getIdentityVerificationById(db, verificationId) {
  const result = await db.query(
    `SELECT v.*,
            COALESCE(NULLIF(TRIM(u.full_name), ''), TRIM(CONCAT_WS(' ', u.first_name, u.last_name))) AS requester_name,
            b.name AS branch_name,
            c.branch_id AS primary_match_branch_id,
            t.status AS transfer_status,
            t.source_branch_id AS transfer_source_branch_id,
            t.target_branch_id AS transfer_target_branch_id,
            t.rejection_note AS transfer_rejection_note,
            t.revision_note AS transfer_revision_note,
            COALESCE(NULLIF(TRIM(bm.full_name), ''), TRIM(CONCAT_WS(' ', bm.first_name, bm.last_name))) AS decided_by_name
     FROM customer_identity_verifications v
     LEFT JOIN users u ON u.id = v.requested_by
     LEFT JOIN users bm ON bm.id = v.decided_by
     LEFT JOIN branches b ON b.id = v.branch_id
     LEFT JOIN customers c ON c.customer_id = v.primary_match_customer_id
     LEFT JOIN customer_branch_transfers t ON t.transfer_id = v.linked_transfer_id
     WHERE v.verification_id = $1`,
    [verificationId]
  );
  return result.rows[0] || null;
}

export async function listMyOpenIdentityVerifications(db, { requestedBy, limit = 5 } = {}) {
  const result = await db.query(
    `SELECT v.*,
            COALESCE(NULLIF(TRIM(u.full_name), ''), TRIM(CONCAT_WS(' ', u.first_name, u.last_name))) AS requester_name,
            b.name AS branch_name,
            c.branch_id AS primary_match_branch_id,
            t.status AS transfer_status,
            t.rejection_note AS transfer_rejection_note,
            t.revision_note AS transfer_revision_note
     FROM customer_identity_verifications v
     LEFT JOIN users u ON u.id = v.requested_by
     LEFT JOIN branches b ON b.id = v.branch_id
     LEFT JOIN customers c ON c.customer_id = v.primary_match_customer_id
     LEFT JOIN customer_branch_transfers t ON t.transfer_id = v.linked_transfer_id
     WHERE v.requested_by = $1
       AND (
         v.status = ANY($2::text[])
         OR (v.status = 'Different Person' AND v.clearance_token IS NOT NULL AND v.clearance_expires_at > CURRENT_TIMESTAMP)
         OR (v.status = 'Same Person' AND v.decided_at > CURRENT_TIMESTAMP - INTERVAL '24 hours')
       )
     ORDER BY v.updated_at DESC
     LIMIT $3`,
    [requestedBy, OPEN_IDENTITY_STATUSES, Math.min(Number(limit) || 5, 20)]
  );
  return result.rows;
}

export function deriveDisplayStatus(row) {
  if (!row) return null;
  if (row.status === 'Pending') return 'Pending BM Review';
  if (row.status === 'Needs Evidence') return 'Needs Further Review';
  if (row.status === 'Different Person') return 'Different Person Confirmed';
  if (row.status === 'Same Person') return 'Same Person Confirmed';
  if (row.status === 'Completed') return 'Completed';
  if (row.status === 'Cancelled') return 'Cancelled';
  if (row.status === 'Transfer Linked') {
    const ts = row.transfer_status;
    if (ts === 'Pending Source') return 'Transfer Requested';
    if (ts === 'Pending OM') return 'Pending OM Approval';
    if (ts === 'Needs Revision') return 'Transfer Needs Revision';
    if (ts === 'Approved') return 'Transfer Approved';
    if (ts === 'Rejected') return 'Transfer Rejected';
    if (ts === 'Cancelled') return 'Transfer Cancelled';
    return 'Transfer Requested';
  }
  return row.status;
}

export function deriveIdentityNextAction(row) {
  if (!row) {
    return { next_action: null, same_branch: null, cross_branch: null };
  }

  if (row.status === 'Pending' || row.status === 'Needs Evidence') {
    return {
      next_action: 'wait',
      same_branch: null,
      cross_branch: null,
      display_status: deriveDisplayStatus(row),
    };
  }

  if (row.status === 'Different Person') {
    return {
      next_action: row.clearance_token ? 'proceed_registration' : 'wait',
      same_branch: null,
      cross_branch: null,
      display_status: deriveDisplayStatus(row),
    };
  }

  if (row.status === 'Transfer Linked') {
    const ts = row.transfer_status;
    if (ts === 'Approved') {
      return {
        next_action: 'open_profile',
        same_branch: true,
        cross_branch: false,
        display_status: deriveDisplayStatus(row),
      };
    }
    if (ts === 'Rejected' || ts === 'Cancelled') {
      return {
        next_action: 'transfer_rejected',
        same_branch: false,
        cross_branch: true,
        display_status: deriveDisplayStatus(row),
      };
    }
    return {
      next_action: 'wait_transfer',
      same_branch: false,
      cross_branch: true,
      display_status: deriveDisplayStatus(row),
    };
  }

  if (row.status === 'Same Person' && row.primary_match_customer_id) {
    const matchBranch = row.primary_match_branch_id != null
      ? Number(row.primary_match_branch_id)
      : (() => {
        const candidates = parseCandidates(row);
        const primary = candidates.find((c) => Number(c.customer_id) === Number(row.primary_match_customer_id))
          || candidates[0];
        return primary?.branch_id != null ? Number(primary.branch_id) : null;
      })();
    const actorBranch = row.branch_id != null ? Number(row.branch_id) : null;
    const sameBranch = matchBranch != null && actorBranch != null && matchBranch === actorBranch;
    const crossBranch = matchBranch != null && actorBranch != null && matchBranch !== actorBranch;
    return {
      next_action: sameBranch ? 'open_profile' : 'request_transfer',
      same_branch: sameBranch,
      cross_branch: crossBranch,
      display_status: deriveDisplayStatus(row),
    };
  }

  if (row.status === 'Completed') {
    return {
      next_action: row.primary_match_customer_id ? 'open_profile' : null,
      same_branch: null,
      cross_branch: null,
      display_status: deriveDisplayStatus(row),
    };
  }

  if (row.status === 'Cancelled') {
    return {
      next_action: 'cancelled',
      same_branch: null,
      cross_branch: null,
      display_status: deriveDisplayStatus(row),
    };
  }

  return { next_action: null, same_branch: null, cross_branch: null, display_status: deriveDisplayStatus(row) };
}

export async function listIdentityVerifications(db, {
  branchId = null,
  status = 'Pending',
  statuses = null,
  limit = 100,
} = {}) {
  const params = [];
  const conditions = [];
  if (branchId != null) {
    params.push(Number(branchId));
    conditions.push(`v.branch_id = $${params.length}`);
  }
  if (Array.isArray(statuses) && statuses.length) {
    params.push(statuses);
    conditions.push(`v.status = ANY($${params.length}::text[])`);
  } else if (status) {
    params.push(status);
    conditions.push(`v.status = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 100, 200));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT v.*,
            COALESCE(NULLIF(TRIM(u.full_name), ''), TRIM(CONCAT_WS(' ', u.first_name, u.last_name))) AS requester_name,
            b.name AS branch_name,
            t.status AS transfer_status
     FROM customer_identity_verifications v
     LEFT JOIN users u ON u.id = v.requested_by
     LEFT JOIN branches b ON b.id = v.branch_id
     LEFT JOIN customer_branch_transfers t ON t.transfer_id = v.linked_transfer_id
     ${where}
     ORDER BY v.created_at ASC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

function findCandidate(row, matchCustomerId) {
  const candidates = parseCandidates(row);
  if (matchCustomerId == null) return candidates[0] || null;
  return candidates.find((c) => Number(c.customer_id) === Number(matchCustomerId)) || null;
}

export async function decideIdentityVerification(client, {
  verificationId,
  decision,
  note,
  decidedBy,
  matchCustomerId = null,
}) {
  const existing = await client.query(
    `SELECT * FROM customer_identity_verifications WHERE verification_id = $1 FOR UPDATE`,
    [verificationId]
  );
  if (!existing.rows.length) {
    const err = new Error('Identity verification not found.');
    err.status = 404;
    throw err;
  }
  const row = existing.rows[0];
  if (!['Pending', 'Needs Evidence'].includes(row.status)) {
    const err = new Error('This verification was already decided.');
    err.status = 400;
    throw err;
  }

  const normalized = String(decision || '').trim().toLowerCase();
  let nextStatus;
  let clearanceToken = null;
  let clearanceExpires = null;
  let primaryMatchId = row.primary_match_customer_id;

  if (normalized === 'needs_evidence' || normalized === 'needs evidence' || normalized === 'further_review') {
    nextStatus = 'Needs Evidence';
  } else if (normalized === 'same_person' || normalized === 'same person') {
    const candidate = findCandidate(row, matchCustomerId);
    if (!candidate?.customer_id) {
      const err = new Error('Select a same-branch customer candidate to confirm.');
      err.status = 400;
      throw err;
    }
    // Same Person identity decisions are only for same-branch candidates.
    if (candidate.cross_branch || Number(candidate.branch_id) !== Number(row.branch_id)) {
      const err = new Error(
        'This customer belongs to another branch. Request a Customer Branch Transfer instead of Same Person.'
      );
      err.status = 400;
      throw err;
    }
    nextStatus = 'Same Person';
    primaryMatchId = candidate.customer_id;
  } else if (normalized === 'different_person' || normalized === 'different person' || normalized === 'clear') {
    const candidate = findCandidate(row, matchCustomerId);
    if (candidate && (candidate.cross_branch || Number(candidate.branch_id) !== Number(row.branch_id))) {
      const err = new Error(
        'Cross-branch matches cannot be cleared with Different Person. Use Customer Branch Transfer, or confirm a same-branch candidate is a different person.'
      );
      err.status = 400;
      throw err;
    }
    if (candidate?.customer_id) primaryMatchId = candidate.customer_id;
    nextStatus = 'Different Person';
    clearanceToken = crypto.randomUUID();
    clearanceExpires = new Date(Date.now() + CLEARANCE_HOURS * 3600 * 1000);
  } else if (normalized === 'cancel' || normalized === 'cancelled' || normalized === 'reject') {
    nextStatus = 'Cancelled';
  } else {
    const err = new Error('decision must be same_person, different_person, needs_evidence, or cancel.');
    err.status = 400;
    throw err;
  }

  const updated = await client.query(
    `UPDATE customer_identity_verifications
     SET status = $2,
         decision_note = $3,
         decided_by = $4,
         decided_at = CURRENT_TIMESTAMP,
         clearance_token = $5,
         clearance_expires_at = $6,
         primary_match_customer_id = $7,
         updated_at = CURRENT_TIMESTAMP
     WHERE verification_id = $1
     RETURNING *`,
    [
      verificationId,
      nextStatus,
      note || null,
      decidedBy,
      clearanceToken,
      clearanceExpires,
      primaryMatchId,
    ]
  );

  if (nextStatus !== 'Needs Evidence') {
    await resolveAlertsBySourceKey(client, `customer-identity-verification:${verificationId}`, {
      resolvedBy: decidedBy,
      resolutionNote: nextStatus === 'Same Person'
        ? (note || 'BM confirmed same person — use existing customer.')
        : nextStatus === 'Different Person'
          ? (note || 'BM cleared duplicate flag — registration may proceed.')
          : (note || `Identity verification ${nextStatus}.`),
    });
  }

  const decided = updated.rows[0];
  let primaryMatchBranchId = null;
  if (decided.primary_match_customer_id) {
    const cust = await client.query(
      `SELECT branch_id FROM customers WHERE customer_id = $1`,
      [decided.primary_match_customer_id]
    );
    primaryMatchBranchId = cust.rows[0]?.branch_id ?? null;
  }

  const actionMeta = deriveIdentityNextAction({
    ...decided,
    primary_match_branch_id: primaryMatchBranchId,
  });

  return {
    ...decided,
    primary_match_branch_id: primaryMatchBranchId,
    ...actionMeta,
  };
}

/** BM starts transfer for a cross-branch candidate and links it to the identity ticket. */
export async function linkBranchTransferToIdentity(client, {
  verificationId,
  matchCustomerId,
  transferId,
  decidedBy,
  note = null,
}) {
  const existing = await client.query(
    `SELECT * FROM customer_identity_verifications WHERE verification_id = $1 FOR UPDATE`,
    [verificationId]
  );
  if (!existing.rows.length) {
    const err = new Error('Identity verification not found.');
    err.status = 404;
    throw err;
  }
  const row = existing.rows[0];
  if (!['Pending', 'Needs Evidence'].includes(row.status) && row.status !== 'Transfer Linked') {
    const err = new Error('This verification can no longer be linked to a transfer.');
    err.status = 400;
    throw err;
  }

  const candidate = findCandidate(row, matchCustomerId);
  if (!candidate?.customer_id) {
    const err = new Error('Select a cross-branch customer candidate for transfer.');
    err.status = 400;
    throw err;
  }
  if (!candidate.cross_branch && Number(candidate.branch_id) === Number(row.branch_id)) {
    const err = new Error('This candidate belongs to the same branch. Use Same Person / Different Person instead.');
    err.status = 400;
    throw err;
  }

  const updated = await client.query(
    `UPDATE customer_identity_verifications
     SET status = 'Transfer Linked',
         linked_transfer_id = $2,
         primary_match_customer_id = $3,
         decided_by = $4,
         decided_at = CURRENT_TIMESTAMP,
         decision_note = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE verification_id = $1
     RETURNING *`,
    [
      verificationId,
      transferId,
      candidate.customer_id,
      decidedBy,
      note || 'Routed to Customer Branch Transfer workflow.',
    ]
  );

  await resolveAlertsBySourceKey(client, `customer-identity-verification:${verificationId}`, {
    resolvedBy: decidedBy,
    resolutionNote: note || 'Cross-branch match routed to branch transfer.',
  });

  return updated.rows[0];
}

export async function markIdentityCompleted(client, verificationId) {
  const result = await client.query(
    `UPDATE customer_identity_verifications
     SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
     WHERE verification_id = $1
       AND status IN ('Same Person', 'Transfer Linked', 'Different Person')
     RETURNING *`,
    [verificationId]
  );
  return result.rows[0] || null;
}

export async function consumeClearanceToken(client, token, branchId) {
  if (!token) return null;
  const result = await client.query(
    `SELECT * FROM customer_identity_verifications
     WHERE clearance_token = $1
       AND status = 'Different Person'
       AND branch_id = $2
       AND clearance_expires_at IS NOT NULL
       AND clearance_expires_at > CURRENT_TIMESTAMP
     FOR UPDATE`,
    [String(token), Number(branchId)]
  );
  if (!result.rows.length) {
    const err = new Error('Identity clearance is missing, expired, or invalid. Request BM verification again.');
    err.status = 400;
    throw err;
  }
  await client.query(
    `UPDATE customer_identity_verifications
     SET clearance_token = NULL,
         status = 'Completed',
         updated_at = CURRENT_TIMESTAMP
     WHERE verification_id = $1`,
    [result.rows[0].verification_id]
  );
  return result.rows[0];
}
