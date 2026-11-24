import express from 'express';
import { requireAuth, requireRole, requireAssignedBranch, assertSameBranch, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';
import {
  applyBranchOperationsState,
  findInactivityCandidates,
  loadBranchPolicies,
  normalizeBranchPolicies,
  OPERATIONS_STATES,
  refreshBranchLastActivity,
  saveBranchPolicies,
  validateBranchPolicies,
} from '../lib/branchPolicies.js';

const router = express.Router();
router.use(requireRole(ROLE_SETS.branches), requireAssignedBranch);

const BRANCH_SELECT = `
  b.id            AS branch_id,
  b.id            AS id,
  b.branch_code,
  b.name          AS branch_name,
  b.address,
  b.address_street,
  b.address_barangay,
  b.address_city,
  b.address_province,
  b.region,
  b.address_zip,
  b.latitude,
  b.longitude,
  b.phone         AS contact_no,
  b.phone,
  b.email,
  b.status,
  b.operations_state,
  b.operations_reason,
  b.operations_recorded_at,
  b.status_reason,
  b.status_changed_at,
  b.status_policy_key,
  b.last_activity_at,
  b.created_at,
  b.updated_at,
  mgr.id          AS manager_id,
  mgr.full_name   AS manager_name,
  mgr.email       AS manager_email,
  mgr.employee_id AS manager_employee_id
`;

function composeAddress(parts = {}) {
  return [
    parts.address_street,
    parts.address_barangay,
    parts.address_city,
    parts.address_province,
    parts.region || parts.address_region,
    parts.address_zip,
  ].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
}

function requireOrgScope(req, res, next) {
  if (!isUnscoped(req.currentUser)) {
    return res.status(403).json({
      success: false,
      message: 'Only organization administrators can modify branches.',
    });
  }
  return next();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

/** Accept PH mobile (09XXXXXXXXX) or landline with area code (7–8 local digits). */
function isValidPhPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('63') && local.length >= 11) local = `0${local.slice(2)}`;
  if (/^09\d{9}$/.test(local)) return true;
  return /^0\d{8,11}$/.test(local);
}

function normalizeBranchPayload(body, partial = false) {
  const out = {};
  const pick = (key, transform = (v) => v) => {
    if (body[key] !== undefined) out[key] = transform(body[key]);
  };
  pick('branch_name', (v) => String(v || '').trim());
  pick('name', (v) => String(v || '').trim());
  pick('address', (v) => String(v || '').trim());
  pick('address_street', (v) => String(v || '').trim() || null);
  pick('address_barangay', (v) => String(v || '').trim() || null);
  pick('address_city', (v) => String(v || '').trim() || null);
  pick('address_province', (v) => String(v || '').trim() || null);
  pick('address_region', (v) => String(v || '').trim() || null);
  pick('address_zip', (v) => String(v || '').trim() || null);
  pick('latitude', (v) => Number(v));
  pick('longitude', (v) => Number(v));
  pick('phone', (v) => String(v || '').trim());
  pick('contact_no', (v) => String(v || '').trim());
  pick('email', (v) => String(v || '').trim().toLowerCase());
  pick('region', (v) => (v ? String(v).trim() : null));
  pick('manager_id', (v) => (v === null || v === '' ? null : Number(v)));
  // Status is policy/operations-driven — ignore client status on create/update payloads.
  if (out.address_region && !out.region) out.region = out.address_region;

  if (!partial) {
    const name = out.branch_name || out.name;
    if (!name) return { error: 'branch_name is required.' };
    if (!out.address_barangay || !out.address_city || !out.address_province) {
      return { error: 'Province, city/municipality, and barangay are required.' };
    }
    if (!Number.isFinite(out.latitude) || !Number.isFinite(out.longitude)) {
      return { error: 'Place a map pin so latitude and longitude can be stored.' };
    }
    const phone = out.phone || out.contact_no;
    if (!phone) return { error: 'phone is required.' };
    if (!isValidPhPhone(phone)) {
      return { error: 'phone must be a valid Philippine mobile or landline number.' };
    }
    if (!out.email) return { error: 'email is required.' };
    if (!isValidEmail(out.email)) return { error: 'email format is invalid.' };
    out.branch_name = name;
    out.phone = phone;
    out.region = out.region || out.address_region || out.address_province || null;
    out.address = out.address || composeAddress({
      address_street: out.address_street,
      address_barangay: out.address_barangay,
      address_city: out.address_city,
      address_province: out.address_province,
      region: out.region,
      address_zip: out.address_zip,
    });
    if (!out.address) return { error: 'address is required.' };
  } else {
    const phone = out.phone || out.contact_no;
    if (phone !== undefined && phone !== '' && !isValidPhPhone(phone)) {
      return { error: 'phone must be a valid Philippine mobile or landline number.' };
    }
    if (out.email !== undefined && out.email !== '' && !isValidEmail(out.email)) {
      return { error: 'email format is invalid.' };
    }
    if (phone) out.phone = phone;
    if (
      out.address_street !== undefined
      || out.address_barangay !== undefined
      || out.address_city !== undefined
      || out.address_province !== undefined
      || out.address_zip !== undefined
      || out.region !== undefined
      || out.address_region !== undefined
    ) {
      // Caller may send partial address; compose only when enough parts exist.
      const composed = composeAddress({
        address_street: out.address_street,
        address_barangay: out.address_barangay,
        address_city: out.address_city,
        address_province: out.address_province,
        region: out.region || out.address_region,
        address_zip: out.address_zip,
      });
      if (composed) out.address = composed;
      if (out.address_region) out.region = out.address_region;
    }
  }
  return { data: out };
}

const PAYMENT_SETTINGS_SELECT = `
  b.id AS branch_id,
  b.name AS branch_name,
  b.gcash_account_name,
  b.gcash_mobile,
  b.gcash_qr_image
`;

function normalizePaymentSettingsPayload(body = {}) {
  const out = {};
  if (body.gcash_account_name !== undefined) {
    const name = String(body.gcash_account_name || '').trim();
    if (name.length > 120) return { error: 'GCash account name must be 120 characters or fewer.' };
    out.gcash_account_name = name || null;
  }
  if (body.gcash_mobile !== undefined) {
    const mobile = String(body.gcash_mobile || '').trim();
    if (mobile.length > 30) return { error: 'GCash mobile must be 30 characters or fewer.' };
    out.gcash_mobile = mobile || null;
  }
  if (body.gcash_qr_image !== undefined) {
    const image = String(body.gcash_qr_image || '').trim();
    if (image && !image.startsWith('data:image/') && !/^https?:\/\//i.test(image)) {
      return { error: 'GCash QR must be an uploaded image (data URL) or image URL.' };
    }
    if (image.length > 6_000_000) return { error: 'GCash QR image is too large.' };
    out.gcash_qr_image = image || null;
  }
  return { data: out };
}

// ── Policies / payment settings (must be registered before /:id) ───────────────

router.get('/me/payment-settings', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const branchId = user.branchId;
    if (branchId == null) {
      return res.status(400).json({ success: false, message: 'No branch assigned.' });
    }
    const result = await pool.query(
      `SELECT ${PAYMENT_SETTINGS_SELECT} FROM branches b WHERE b.id = $1`,
      [branchId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Branches] GET /me/payment-settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load payment settings.' });
  }
});

router.patch('/me/payment-settings', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    if (!['branch_manager', 'operating_manager', 'super_admin'].includes(user.roleSlug)) {
      return res.status(403).json({ success: false, message: 'Only Branch Managers can update payment settings.' });
    }
    const branchId = user.branchId;
    if (branchId == null) {
      return res.status(400).json({ success: false, message: 'No branch assigned.' });
    }
    const normalized = normalizePaymentSettingsPayload(req.body);
    if (normalized.error) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const d = normalized.data;
    const fields = [];
    const params = [];
    let idx = 1;
    for (const key of ['gcash_account_name', 'gcash_mobile', 'gcash_qr_image']) {
      if (d[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(d[key]);
      }
    }
    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No payment settings to update.' });
    }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(branchId);
    await pool.query(
      `UPDATE branches SET ${fields.join(', ')} WHERE id = $${idx}`,
      params
    );
    const refreshed = await pool.query(
      `SELECT ${PAYMENT_SETTINGS_SELECT} FROM branches b WHERE b.id = $1`,
      [branchId]
    );
    await writeAuditFromReq(pool, req, {
      module: 'Branch Management',
      activity: 'Update Branch Payment Settings',
      action: 'Update Branch Payment Settings',
      description: 'Updated branch GCash QR / account settings for Spot Cash.',
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `branch:${branchId}`,
      branchId,
    });
    return res.status(200).json({
      success: true,
      message: 'Branch payment settings saved.',
      data: refreshed.rows[0],
    });
  } catch (err) {
    console.error('[Branches] PATCH /me/payment-settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save payment settings.' });
  }
});

router.get('/policies', requireAuth, requireOrgScope, async (req, res) => {
  try {
    const policies = await loadBranchPolicies(req.app.locals.pool);
    return res.status(200).json({ success: true, data: policies });
  } catch (err) {
    console.error('[Branches] GET /policies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load branch policies.' });
  }
});

router.put('/policies', requireAuth, requireOrgScope, async (req, res) => {
  try {
    const validated = validateBranchPolicies(req.body);
    if (validated.error) {
      return res.status(400).json({ success: false, message: validated.error });
    }
    const policies = await saveBranchPolicies(req.app.locals.pool, validated.policies);
    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'System Configuration',
      activity: 'Update Branch Policies',
      action: 'Update Branch Policies',
      description: `Updated branch inactivity policy (mode=${policies.inactivity.mode}, months=${policies.inactivity.inactivityMonths ?? 'n/a'}).`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: 'system_settings:branch_policies',
    });
    return res.status(200).json({ success: true, message: 'Branch policies saved.', data: policies });
  } catch (err) {
    console.error('[Branches] PUT /policies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save branch policies.' });
  }
});

router.get('/policies/inactivity-preview', requireAuth, requireOrgScope, async (req, res) => {
  try {
    const months = Number(req.query.months);
    if (!Number.isInteger(months) || months < 1) {
      return res.status(400).json({ success: false, message: 'Provide a valid months threshold.' });
    }
    const policies = normalizeBranchPolicies({
      inactivity: { mode: 'notify', inactivityMonths: months, reactivateOnActivity: true },
    });
    const candidates = await findInactivityCandidates(req.app.locals.pool, policies);
    return res.status(200).json({
      success: true,
      data: {
        candidates: candidates.map((row) => ({
          id: row.id,
          branchCode: row.branch_code,
          name: row.name,
          lastActivityAt: row.last_activity_at,
          monthsInactive: row.months_inactive,
          operationsState: row.operations_state,
        })),
      },
    });
  } catch (err) {
    console.error('[Branches] GET /policies/inactivity-preview error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to preview inactive branches.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branches
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const scopedBranchId = isUnscoped(user) ? null : user.branchId;
    const branchWhere = scopedBranchId ? 'WHERE b.id = $1' : '';
    const params = scopedBranchId ? [scopedBranchId] : [];

    const result = await pool.query(
      `SELECT
         ${BRANCH_SELECT},
         COUNT(DISTINCT u.id)  FILTER (WHERE u.status = 'Active') AS active_staff,
         COUNT(DISTINCT u.id)                                      AS total_staff,
         COUNT(DISTINCT c.customer_id)                             AS customer_count,
         COUNT(DISTINCT c.customer_id) FILTER (WHERE c.status = 'Active') AS active_customers,
         COUNT(DISTINCT bi.inventory_id) FILTER (WHERE bi.available_stock <= bi.reorder_level) AS low_stock_count,
         COALESCE((SELECT SUM(bi2.available_stock) FROM branch_inventory bi2 WHERE bi2.branch_id = b.id), 0) AS total_inventory
       FROM branches b
       LEFT JOIN users mgr ON mgr.id = b.manager_id
       LEFT JOIN users u   ON u.branch_id = b.id
       LEFT JOIN customers c ON c.branch_id = b.id
       LEFT JOIN branch_inventory bi ON bi.branch_id = b.id
       ${branchWhere}
       GROUP BY b.id, b.branch_code, b.name, b.address, b.address_street, b.address_barangay,
                b.address_city, b.address_province, b.region, b.address_zip, b.latitude, b.longitude,
                b.phone, b.email, b.status, b.operations_state, b.operations_reason, b.operations_recorded_at,
                b.status_reason, b.status_changed_at, b.status_policy_key, b.last_activity_at,
                b.created_at, b.updated_at,
                mgr.id, mgr.full_name, mgr.email, mgr.employee_id
       ORDER BY b.name`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Branches] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branches.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branches/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const bid = Number(req.params.id);
    if (!assertSameBranch(res, req.currentUser, bid)) return;

    const branchResult = await pool.query(
      `SELECT ${BRANCH_SELECT}
       FROM branches b
       LEFT JOIN users mgr ON mgr.id = b.manager_id
       WHERE b.id = $1`,
      [bid]
    );

    if (branchResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    const [staffResult, customerResult, inventoryResult] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name, u.email, u.status, u.employee_id, r.role_name
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.branch_id = $1 AND u.status = 'Active'
           AND r.slug <> ALL($2::text[])
         ORDER BY r.role_name, u.full_name`,
        [bid, ['super_admin', 'operating_manager', 'customer', 'client']]
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'Active') AS active,
                COALESCE(SUM(ca.outstanding_balance), 0) AS total_outstanding
         FROM customers c
         LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
         WHERE c.branch_id = $1`,
        [bid]
      ),
      pool.query(
        `SELECT p.name AS product_name, bi.available_stock, bi.reorder_level, bi.status AS stock_status
         FROM branch_inventory bi
         JOIN products p ON p.id = bi.product_id
         WHERE bi.branch_id = $1
         ORDER BY bi.available_stock ASC
         LIMIT 25`,
        [bid]
      ),
    ]);

    let lastActivityAt = branchResult.rows[0].last_activity_at;
    try {
      lastActivityAt = await refreshBranchLastActivity(pool, bid);
    } catch (err) {
      console.warn('[Branches] last activity refresh skipped:', err.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        ...branchResult.rows[0],
        last_activity_at: lastActivityAt,
        staff: staffResult.rows,
        customers: {
          total: Number(customerResult.rows[0].total),
          active: Number(customerResult.rows[0].active),
          totalOutstanding: Number(customerResult.rows[0].total_outstanding),
        },
        inventory: inventoryResult.rows,
      },
    });
  } catch (err) {
    console.error('[Branches] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branch.' });
  }
});

// POST /api/branches
router.post('/', requireAuth, requireOrgScope, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const normalized = normalizeBranchPayload(req.body, false);
    if (normalized.error) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const d = normalized.data;

    const result = await pool.query(
      `INSERT INTO branches (
         name, branch_code, address, address_street, address_barangay, address_city,
         address_province, region, address_zip, latitude, longitude, phone, email,
         status, operations_state, manager_id, last_activity_at
       )
       VALUES (
         $1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         'Active', 'operating', $13, CURRENT_TIMESTAMP
       )
       RETURNING id AS branch_id, branch_code, name AS branch_name, address,
                 address_street, address_barangay, address_city, address_province, region, address_zip,
                 latitude, longitude, phone AS contact_no, email, status, operations_state,
                 manager_id, created_at, updated_at`,
      [
        d.branch_name,
        d.address,
        d.address_street,
        d.address_barangay,
        d.address_city,
        d.address_province,
        d.region,
        d.address_zip,
        d.latitude,
        d.longitude,
        d.phone,
        d.email,
        d.manager_id ?? null,
      ]
    );

    await writeAuditFromReq(pool, req, {
      module: 'Branch Management',
      activity: 'Create Branch',
      action: 'Create Branch',
      description: `Created branch ${result.rows[0].branch_name} (${result.rows[0].branch_code}).`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `branch:${result.rows[0].branch_id}`,
      branchId: result.rows[0].branch_id,
    });

    return res.status(201).json({
      success: true,
      message: 'Branch created.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Branches] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create branch.' });
  }
});

// PUT /api/branches/:id
router.put('/:id', requireAuth, requireOrgScope, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const bid = Number(req.params.id);
    if (!Number.isFinite(bid)) {
      return res.status(400).json({ success: false, message: 'Invalid branch ID.' });
    }

    const normalized = normalizeBranchPayload(req.body, true);
    if (normalized.error) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const d = normalized.data;
    const fields = [];
    const params = [];
    let idx = 1;

    const add = (column, value) => {
      fields.push(`${column} = $${idx++}`);
      params.push(value);
    };

    if (d.branch_name || d.name) add('name', d.branch_name || d.name);
    if (d.address !== undefined) add('address', d.address);
    if (d.address_street !== undefined) add('address_street', d.address_street);
    if (d.address_barangay !== undefined) add('address_barangay', d.address_barangay);
    if (d.address_city !== undefined) add('address_city', d.address_city);
    if (d.address_province !== undefined) add('address_province', d.address_province);
    if (d.address_zip !== undefined) add('address_zip', d.address_zip);
    if (d.region !== undefined) add('region', d.region);
    if (d.latitude !== undefined) {
      if (!Number.isFinite(d.latitude)) {
        return res.status(400).json({ success: false, message: 'latitude must be a valid number from the map pin.' });
      }
      add('latitude', d.latitude);
    }
    if (d.longitude !== undefined) {
      if (!Number.isFinite(d.longitude)) {
        return res.status(400).json({ success: false, message: 'longitude must be a valid number from the map pin.' });
      }
      add('longitude', d.longitude);
    }
    if (d.phone !== undefined || d.contact_no !== undefined) add('phone', d.phone || d.contact_no);
    if (d.email !== undefined) add('email', d.email);
    if (d.manager_id !== undefined) add('manager_id', d.manager_id);
    // Intentionally ignore status from clients — use operations endpoint / policy sweep.

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(bid);

    const result = await pool.query(
      `UPDATE branches SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id AS branch_id, branch_code, name AS branch_name, address,
                 address_street, address_barangay, address_city, address_province, region, address_zip,
                 latitude, longitude, phone AS contact_no, email, status, operations_state,
                 manager_id, created_at, updated_at`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    await writeAuditFromReq(pool, req, {
      module: 'Branch Management',
      activity: 'Update Branch',
      action: 'Update Branch',
      description: `Updated branch ${result.rows[0].branch_name} (${result.rows[0].branch_code}).`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `branch:${bid}`,
      branchId: bid,
    });

    return res.status(200).json({
      success: true,
      message: 'Branch updated.',
      data: result.rows[0],
    });
  } catch (err) {
    if (err?.code === '23514' || /Branch Code .* cannot be changed/i.test(err.message || '')) {
      return res.status(400).json({ success: false, message: 'Branch Code cannot be changed.' });
    }
    console.error('[Branches] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update branch.' });
  }
});

// POST /api/branches/:id/operations — record formal suspension / cessation / resume
router.post('/:id/operations', requireAuth, requireOrgScope, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const bid = Number(req.params.id);
    if (!Number.isFinite(bid)) {
      return res.status(400).json({ success: false, message: 'Invalid branch ID.' });
    }

    const operationsState = String(req.body?.operations_state || req.body?.operationsState || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!OPERATIONS_STATES.includes(operationsState)) {
      return res.status(400).json({
        success: false,
        message: 'operations_state must be operating, suspended, or ceased.',
      });
    }

    const existing = await pool.query(`SELECT * FROM branches WHERE id = $1`, [bid]);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    const client = await pool.connect();
    let updated;
    try {
      await client.query('BEGIN');
      updated = await applyBranchOperationsState(client, existing.rows[0], {
        operationsState,
        reason,
        actorId: req.currentUser?.id ?? null,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(400).json({ success: false, message: err.message || 'Failed to record operations state.' });
    } finally {
      client.release();
    }

    await writeAuditFromReq(pool, req, {
      module: 'Branch Management',
      activity: 'Record Branch Operations',
      action: 'Record Branch Operations',
      description: `Recorded ${operationsState} for ${updated.name} (${updated.branch_code}).${reason ? ` Reason: ${reason}` : ''}`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `branch:${bid}`,
      branchId: bid,
    });

    return res.status(200).json({
      success: true,
      message: 'Branch operations state recorded.',
      data: {
        branch_id: updated.id,
        branch_code: updated.branch_code,
        branch_name: updated.name,
        status: updated.status,
        operations_state: updated.operations_state,
        operations_reason: updated.operations_reason,
        status_reason: updated.status_reason,
        status_changed_at: updated.status_changed_at,
      },
    });
  } catch (err) {
    console.error('[Branches] POST /:id/operations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record branch operations state.' });
  }
});

export default router;
