import express from 'express';
import { allow, assertSameBranch, canViewCustomerFinancialDetails, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import {
  createPortalInvitation,
  resendPortalInvitation,
  dispatchPortalActivationEmail,
} from '../lib/customerPortal.js';
import { isMailConfigured } from '../lib/mail.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';
import { notifyCustomerProfileUpdated, writeCustomerAudit } from '../lib/customerNotifications.js';
import {
  OVERDUE_CUSTOMER_SQL,
  paymentStandingFromFlags,
} from '../lib/customerStanding.js';
import { createCreditReview } from '../lib/creditReview.js';
import {
  findCustomerDuplicates,
  limitedMatchCard,
  digitsOnly,
  maskPhone,
} from '../lib/customerDuplicateLookup.js';
import { upsertOpenOperationalAlert, resolveAlertsBySourceKey } from '../lib/operationalAlerts.js';
import {
  createIdentityVerification,
  listIdentityVerifications,
  listMyOpenIdentityVerifications,
  getIdentityVerificationById,
  deriveIdentityNextAction,
  decideIdentityVerification,
  linkBranchTransferToIdentity,
  consumeClearanceToken,
  findOpenIdentityForRequester,
} from '../lib/customerIdentityVerification.js';
import {
  createBranchTransferRequest,
  listBranchTransfers,
  sourceBmSubmitTransfer,
  omDecideTransfer,
} from '../lib/customerBranchTransfer.js';

/** Stable advisory-lock key for concurrent cash registration by phone. */
const CUSTOMER_CREATE_PHONE_LOCK_NS = 748392210;
function phoneAdvisoryKey(phoneDigits) {
  const digits = String(phoneDigits || '');
  let h = 0;
  for (let i = 0; i < digits.length; i += 1) {
    h = ((h << 5) - h + digits.charCodeAt(i)) | 0;
  }
  return h || 1;
}

const GOVERNMENT_ID_TYPES = new Set([
  'Philippine National ID',
  "Driver's License",
  'Passport',
  'UMID',
  'SSS ID',
  'PhilHealth ID',
  'Postal ID',
  "Voter's ID",
  'PRC ID',
  'Other',
]);

const ID_VERIFICATION_STATUSES = new Set(['Unverified', 'Pending Review', 'Verified']);

const CIVIL_STATUSES = new Set([
  'Single',
  'Married',
  'Widowed',
  'Separated',
  'Annulled',
  'Divorced',
]);

function parseOptionalCoord(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeIdPhoto(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const photo = String(value).trim();
  if (!photo.startsWith('data:image/')) {
    throw new Error('id_photo must be a valid image upload.');
  }
  if (photo.length > 900_000) {
    throw new Error('id_photo is too large. Use a smaller image.');
  }
  return photo;
}

function cleanPart(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function composeAddress(parts = {}) {
  return [
    parts.address_street,
    parts.address_barangay,
    parts.address_city,
    parts.address_province,
    parts.address_region,
    parts.address_zip,
  ]
    .map((part) => cleanPart(part))
    .filter(Boolean)
    .join(', ');
}

function namesMatchCustomer(customerName, contactName) {
  const normalize = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const left = normalize(customerName);
  const right = normalize(contactName);
  return Boolean(left && right && left === right);
}

function phonesMatch(a, b) {
  const digits = (value) => String(value || '').replace(/\D/g, '');
  const left = digits(a);
  const right = digits(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function salesAgentDisplayName(user) {
  if (!user) return 'Sales Agent';
  return user.fullName
    || user.full_name
    || [user.first_name, user.last_name].filter(Boolean).join(' ')
    || 'Sales Agent';
}

const PORTAL_EMAIL_NOT_CONFIGURED = 'Portal invitations are sent by email. Gmail (SMTP) is not configured on the server yet — ask your administrator to set SMTP in .env and restart the API.';

function buildPortalApiPayload(portalMeta, emailResult) {
  const emailSent = Boolean(emailResult?.sent);
  return {
    status: 'invited',
    email: portalMeta.portalEmail,
    expiresAt: portalMeta.expiresAt,
    emailSent,
    emailSkipped: Boolean(emailResult?.skipped),
    ...(emailSent ? {} : { activationUrl: portalMeta.activationUrl }),
    ...(emailResult?.error ? { emailError: emailResult.error } : {}),
  };
}

async function loadSalesAgentContact(pool, userId) {
  if (!userId) return { name: null, email: null };
  const result = await pool.query(
    `SELECT email,
            COALESCE(NULLIF(TRIM(full_name), ''), CONCAT_WS(' ', first_name, last_name)) AS display_name
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return { name: null, email: null };
  return { name: row.display_name, email: row.email };
}

const router = express.Router();
router.use(allow(ROLE_SETS.customerRead, ROLE_SETS.customerWrite));

const PURCHASE_VOLUME_UNITS_SQL = `
  COALESCE((
    SELECT SUM(sii.quantity)::INTEGER
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.sales_invoices_id = sii.invoices_id
    WHERE si.customer_id = c.customer_id
  ), 0)`;

const CUSTOMER_SELECT_CORE = `
         c.customer_id,
         c.customer_code,
         c.customer_type,
         c.business_name,
         c.registration_profile_json,
         c.estimated_monthly_revenue,
         c.estimated_monthly_expenses,
         c.existing_obligations,
         c.branch_id,
         c.account_manager_id,
         c.assigned_sales_agent_id,
         c.territory_id,
         t.territory_name,
         c.first_name,
         c.middle_name,
         c.last_name,
         c.name_suffix,
         c.mothers_maiden_name,
         c.civil_status,
         c.address,
         c.address_region,
         c.address_province,
         c.address_city,
         c.address_barangay,
         c.address_street,
         c.address_zip,
         c.latitude,
         c.longitude,
         c.contact_phone,
         c.contact_person_fname,
         c.contact_person_mname,
         c.contact_person_lname,
         c.contact_person_phone,
         c.contact_person_relationship,
         c.secondary_contact_fname,
         c.secondary_contact_lname,
         c.secondary_contact_phone,
         c.secondary_contact_relationship,
         c.status,
         c.user_id,
         c.portal_email,
         c.portal_status,
         c.id_type,
         c.id_number,
         c.id_photo,
         c.id_verification_status,
         c.privacy_notice_acknowledged_at,
         c.privacy_notice_version,
         c.marketing_opt_in,
         c.phone_verification_status,
         c.identity_match_json,
         c.identity_review_note,
         c.identity_reviewed_by,
         c.identity_reviewed_at,
         c.source_assignment_id,
         c.territory_override_note,
         c.created_at,
         c.updated_at,
         b.name AS branch_name,
         COALESCE(NULLIF(TRIM(mgr.full_name), ''), TRIM(CONCAT_WS(' ', mgr.first_name, mgr.last_name))) AS account_manager_name,
         COALESCE(NULLIF(TRIM(agent.full_name), ''), TRIM(CONCAT_WS(' ', agent.first_name, agent.last_name))) AS assigned_sales_agent_name,
         ${PURCHASE_VOLUME_UNITS_SQL} AS "purchaseVolumeUnits"`;

const OUTSTANDING_BALANCE_SQL = `COALESCE((
  SELECT outstanding_balance FROM customer_activity WHERE customer_id = c.customer_id
), 0)`;

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    let {
      branch_id,
      status,
      search,
      standing,
      name_search,
      territory_id,
      assigned_sales_agent_id,
      agent,
      page = 1,
      limit = 20,
      include_stats,
      sort_by: sortByRaw,
      sort_dir: sortDirRaw,
    } = req.query;

    if (!branch_id && req.currentUser && req.currentUser.branchId) {
      branch_id = String(req.currentUser.branchId);
    }

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (branch_id) { conditions.push(`c.branch_id = $${pIdx++}`); params.push(Number(branch_id)); }
    if (status)    { conditions.push(`c.status = $${pIdx++}`);    params.push(status); }
    const salesAgentFilter = Number(assigned_sales_agent_id || agent);
    if (Number.isInteger(salesAgentFilter) && salesAgentFilter > 0) {
      conditions.push(`c.assigned_sales_agent_id = $${pIdx++}`);
      params.push(salesAgentFilter);
    }
    if (territory_id === 'none' || territory_id === 'null') {
      conditions.push(`c.territory_id IS NULL`);
    } else if (territory_id) {
      conditions.push(`c.territory_id = $${pIdx++}`);
      params.push(Number(territory_id));
    }
    if (search) {
      const searchFields = name_search === 'true'
        ? `
        CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) ILIKE $${pIdx}
        OR c.business_name ILIKE $${pIdx}
        OR c.customer_code ILIKE $${pIdx}
        OR c.contact_phone ILIKE $${pIdx}
      `
        : `
        c.first_name ILIKE $${pIdx}
        OR c.last_name ILIKE $${pIdx}
        OR c.middle_name ILIKE $${pIdx}
        OR c.customer_code ILIKE $${pIdx}
        OR c.address ILIKE $${pIdx}
        OR c.address_region ILIKE $${pIdx}
        OR c.address_province ILIKE $${pIdx}
        OR c.address_city ILIKE $${pIdx}
        OR c.address_barangay ILIKE $${pIdx}
        OR c.address_street ILIKE $${pIdx}
        OR c.contact_phone ILIKE $${pIdx}
        OR t.territory_name ILIKE $${pIdx}
        OR b.name ILIKE $${pIdx}
        OR CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')) ILIKE $${pIdx}
        OR CONCAT(COALESCE(c.contact_person_fname, ''), ' ', COALESCE(c.contact_person_lname, '')) ILIKE $${pIdx}
      `;
      conditions.push(`(
        ${searchFields}
      )`);
      params.push(`%${search}%`);
      pIdx += 1;
    }

    const standingKey = String(standing || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (standingKey === 'with_balance') {
      // Collector-compatible: any positive outstanding balance (may include Overdue).
      conditions.push(`${OUTSTANDING_BALANCE_SQL} > 0`);
    } else if (standingKey === 'has_balance') {
      conditions.push(`${OUTSTANDING_BALANCE_SQL} > 0`);
      conditions.push(`NOT (${OVERDUE_CUSTOMER_SQL})`);
    } else if (standingKey === 'current') {
      conditions.push(`${OUTSTANDING_BALANCE_SQL} <= 0`);
    } else if (standingKey === 'overdue') {
      conditions.push(OVERDUE_CUSTOMER_SQL);
    } else if (standingKey === 'assigned_today') {
      if (req.currentUser?.roleSlug !== 'collector' || !req.currentUser?.id) {
        return res.status(403).json({
          success: false,
          message: 'Assigned Today filter is only available to collectors.',
        });
      }
      conditions.push(`EXISTS (
        SELECT 1
        FROM field_visits fv
        WHERE fv.customer_id = c.customer_id
          AND fv.user_id = $${pIdx}
          AND fv.visit_type = 'Collection'
          AND fv.scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
      )`);
      params.push(req.currentUser.id);
      pIdx += 1;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const sortKey = String(sortByRaw || 'created_at').trim().toLowerCase();
    const sortDir = String(sortDirRaw || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const SORT_MAP = {
      name: `LOWER(TRIM(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name))) ${sortDir} NULLS LAST, c.customer_id DESC`,
      code: `c.customer_code ${sortDir} NULLS LAST, c.customer_id DESC`,
      territory: `LOWER(COALESCE(t.territory_name, '')) ${sortDir} NULLS LAST, c.customer_id DESC`,
      outstanding: `"outstandingBalance" ${sortDir} NULLS LAST, c.customer_id DESC`,
      credit_limit: `"creditLimit" ${sortDir} NULLS LAST, c.customer_id DESC`,
      status: `c.status ${sortDir}, c.customer_id DESC`,
      created_at: `c.created_at ${sortDir} NULLS LAST, c.customer_id DESC`,
    };
    const orderSql = SORT_MAP[sortKey] || SORT_MAP.created_at;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM customers c
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       LEFT JOIN branches b ON b.id = c.branch_id
       ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    let activityColumns = `
      ${OUTSTANDING_BALANCE_SQL} AS "outstandingBalance",
    `;
    try {
      const tableCheck = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_activity')`);
      if (tableCheck.rows[0]?.exists) {
        activityColumns = `
          ${OUTSTANDING_BALANCE_SQL} AS "outstandingBalance",
          COALESCE(TO_CHAR((SELECT last_sales_visit FROM customer_activity WHERE customer_id = c.customer_id), 'YYYY-MM-DD'), '') AS "lastVisitDate",
          COALESCE(TO_CHAR((SELECT last_collection_date FROM customer_activity WHERE customer_id = c.customer_id), 'YYYY-MM-DD'), '') AS "lastCollectionDate",
          (
            SELECT TO_CHAR(MIN(si.due_date), 'YYYY-MM-DD')
            FROM sales_invoices si
            LEFT JOIN (
              SELECT sales_id, COALESCE(SUM(payment_amount), 0) AS paid
              FROM credit_history WHERE sales_id IS NOT NULL GROUP BY sales_id
            ) ip ON ip.sales_id = si.sales_invoices_id
            WHERE si.customer_id = c.customer_id
              AND si.status IN ('Confirmed', 'Pending Review')
              AND si.due_date IS NOT NULL
              AND COALESCE(ip.paid, 0) < si.total_amount
          ) AS "earliestDueDate",
          (${OVERDUE_CUSTOMER_SQL}) AS "hasOverdueInvoice",
          CASE
            WHEN NOT (${OVERDUE_CUSTOMER_SQL})
              THEN 0
            ELSE COALESCE(
              GREATEST(
                0,
                (
                  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                  - (
                    SELECT MIN(si.due_date)::date
                    FROM sales_invoices si
                    LEFT JOIN (
                      SELECT sales_id, COALESCE(SUM(payment_amount), 0) AS paid
                      FROM credit_history WHERE sales_id IS NOT NULL GROUP BY sales_id
                    ) ip ON ip.sales_id = si.sales_invoices_id
                    WHERE si.customer_id = c.customer_id
                      AND si.status IN ('Confirmed', 'Pending Review')
                      AND si.due_date IS NOT NULL
                      AND si.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
                      AND COALESCE(ip.paid, 0) < si.total_amount
                  )
                )
              ),
              0
            )
          END AS "daysOverdue",
          (SELECT updated_at FROM customer_activity WHERE customer_id = c.customer_id) AS "activityUpdatedAt",
        `;
      }
    } catch (err) {
      console.error('[Customers] customer_activity check failed:', err.message);
    }

    const creditColumns = `
      COALESCE((
        SELECT cci.credit_limit FROM customer_credit_info cci WHERE cci.customer_id = c.customer_id LIMIT 1
      ), 0) AS "creditLimit",
      (
        SELECT ci.ci_id
        FROM credit_investigations ci
        WHERE ci.customer_id = c.customer_id
          AND ci.status IN ('Pending', 'Revision Requested')
        ORDER BY ci.created_at DESC
        LIMIT 1
      ) AS "openCiId",
      (
        SELECT ci.status
        FROM credit_investigations ci
        WHERE ci.customer_id = c.customer_id
          AND ci.status IN ('Pending', 'Revision Requested')
        ORDER BY ci.created_at DESC
        LIMIT 1
      ) AS "openCiStatus",
    `;

    const result = await pool.query(
      `SELECT
         ${CUSTOMER_SELECT_CORE},
         ${activityColumns}
         ${creditColumns}
         COALESCE(c.contact_phone, '') AS phone
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       ${where}
       ORDER BY ${orderSql}
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, Number(limit), offset]
    );

    const data = result.rows.map((row) => {
      const outstandingBalance = Number(row.outstandingBalance) || 0;
      const hasOverdueInvoice = Boolean(row.hasOverdueInvoice);
      const paymentStatus = paymentStandingFromFlags({
        outstandingBalance,
        hasOverdueInvoice,
      });
      const creditLimit = Number(row.creditLimit) || 0;
      return {
        ...row,
        outstanding_balance: outstandingBalance,
        approved_credit_limit: creditLimit,
        available_credit: creditLimit - outstandingBalance,
        has_overdue_invoice: hasOverdueInvoice,
        paymentStatus,
        paymentStanding: paymentStatus,
      };
    });

    let stats = null;
    if (String(include_stats || '') === '1' || String(include_stats || '').toLowerCase() === 'true') {
      const statsParams = [];
      const statsConditions = [];
      if (branch_id) {
        statsParams.push(Number(branch_id));
        statsConditions.push(`c.branch_id = $1`);
      }
      const statsWhere = statsConditions.length ? `WHERE ${statsConditions.join(' AND ')}` : '';
      const statsResult = await pool.query(
        `SELECT
           COUNT(*)::int AS total_customers,
           COUNT(*) FILTER (WHERE c.status = 'Active')::int AS active_customers,
           COUNT(*) FILTER (WHERE ${OVERDUE_CUSTOMER_SQL})::int AS overdue_customers,
           COUNT(*) FILTER (
             WHERE ${OUTSTANDING_BALANCE_SQL} > 0
               AND NOT (${OVERDUE_CUSTOMER_SQL})
           )::int AS has_balance_customers,
           COALESCE(SUM(${OUTSTANDING_BALANCE_SQL}), 0)::float AS total_outstanding
         FROM customers c
         ${statsWhere}`,
        statsParams
      );
      const row = statsResult.rows[0] || {};
      stats = {
        totalCustomers: Number(row.total_customers) || 0,
        activeCustomers: Number(row.active_customers) || 0,
        overdueCustomers: Number(row.overdue_customers) || 0,
        hasBalanceCustomers: Number(row.has_balance_customers) || 0,
        totalOutstanding: Number(row.total_outstanding) || 0,
      };
    }

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 0,
      },
      meta: stats ? { stats } : undefined,
    });
  } catch (err) {
    console.error('[Customers] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch customers.' });
  }
});

router.get('/lookup', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const actorBranchId = req.currentUser?.branchId != null ? Number(req.currentUser.branchId) : null;
    const result = await findCustomerDuplicates(pool, req.query, { actorBranchId });
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }
    return res.status(200).json({
      success: true,
      data: result.matches,
      count: result.matches.length,
      summary: result.summary,
      requires_bm_verification: Boolean(result.requires_bm_verification),
    });
  } catch (err) {
    console.error('[Customers] GET /lookup error:', err.message);
    return res.status(500).json({ success: false, message: 'Lookup failed.' });
  }
});

router.get('/identity-verifications', allow(ROLE_SETS.customerRead, ROLE_SETS.branchOps), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const mine = String(req.query.mine || '') === '1' || String(req.query.scope || '') === 'mine';
    if (mine) {
      const rows = await listMyOpenIdentityVerifications(pool, {
        requestedBy: req.currentUser.id,
        limit: req.query.limit,
      });
      const enriched = rows.map((row) => ({
        ...row,
        ...deriveIdentityNextAction(row),
      }));
      return res.json({ success: true, data: enriched });
    }
    const status = req.query.status || 'Pending';
    const statuses = req.query.statuses
      ? String(req.query.statuses).split(',').map((s) => s.trim()).filter(Boolean)
      : (status === 'Pending' ? ['Pending', 'Needs Evidence'] : null);
    const branchId = isUnscoped(req.currentUser) ? (req.query.branch_id ? Number(req.query.branch_id) : null) : req.currentUser.branchId;
    const rows = await listIdentityVerifications(pool, {
      branchId,
      status: statuses ? null : status,
      statuses,
      limit: req.query.limit,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Customers] GET /identity-verifications error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load identity verifications.' });
  }
});

router.get('/identity-verifications/:id', async (req, res) => {
  try {
    const verificationId = Number(req.params.id);
    if (!Number.isInteger(verificationId) || verificationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid verification id.' });
    }
    const row = await getIdentityVerificationById(req.app.locals.pool, verificationId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Identity verification not found.' });
    }
    const actorId = Number(req.currentUser?.id || req.currentUser?.user_id);
    const isRequester = Number(row.requested_by) === actorId;
    const isBranchOps = ROLE_SETS.branchOps.includes(req.currentUser?.roleSlug);
    if (!isRequester && !isUnscoped(req.currentUser) && !isBranchOps) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this verification.' });
    }
    if (!isRequester && isBranchOps && !isUnscoped(req.currentUser)
      && !assertSameBranch(res, req.currentUser, row.branch_id)) {
      return;
    }
    const payload = { ...row };
    if (!isRequester) {
      payload.clearance_token = null;
    }
    const actionMeta = deriveIdentityNextAction(row);
    return res.json({
      success: true,
      data: payload,
      ...actionMeta,
      primary_match_customer_id: row.primary_match_customer_id,
    });
  } catch (err) {
    console.error('[Customers] GET /identity-verifications/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load identity verification.' });
  }
});

router.post('/identity-verifications', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const actorBranchId = req.currentUser?.branchId != null ? Number(req.currentUser.branchId) : null;
    if (actorBranchId == null && !isUnscoped(req.currentUser)) {
      return res.status(403).json({ success: false, message: 'No branch assigned.' });
    }
    const searchPayload = req.body?.search || req.body?.search_payload || {};
    const proposed = req.body?.proposed_registration || req.body?.proposed || {};
    const matchesInput = Array.isArray(req.body?.matches) ? req.body.matches : null;
    const attemptKey = req.body?.registration_attempt_key || searchPayload.registration_attempt_key || null;

    let matches = matchesInput;
    if (!matches) {
      const dup = await findCustomerDuplicates(req.app.locals.pool, {
        ...searchPayload,
        contact_phone: searchPayload.contact_phone || proposed.contact_phone,
        name: searchPayload.name
          || [proposed.first_name, proposed.last_name].filter(Boolean).join(' '),
      }, { actorBranchId });
      matches = dup.matches || [];
    }
    const possibleOnly = (matches || []).filter((m) => m.match_tier === 'possible');
    if (!possibleOnly.length) {
      return res.status(400).json({
        success: false,
        message: 'Exact matches do not require Branch Manager identity verification. Open the existing profile or request a branch transfer.',
      });
    }

    await client.query('BEGIN');
    let row;
    try {
      row = await createIdentityVerification(client, {
        branchId: actorBranchId || Number(req.body?.branch_id),
        requestedBy: req.currentUser.id,
        searchPayload,
        proposedRegistration: proposed,
        matches: possibleOnly,
        registrationAttemptKey: attemptKey,
      });
    } catch (createErr) {
      if (createErr.status === 409 && createErr.existingId) {
        await client.query('ROLLBACK');
        const existing = createErr.existingRow
          || await getIdentityVerificationById(req.app.locals.pool, createErr.existingId);
        return res.status(200).json({
          success: true,
          idempotent: true,
          message: createErr.message,
          data: existing,
          ...deriveIdentityNextAction(existing),
        });
      }
      throw createErr;
    }
    await client.query('COMMIT');

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Identity Verification',
      action: 'Request Identity Verification',
      description: `Requested identity verification #${row.verification_id}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `identity_verification:${row.verification_id}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Identity verification submitted to Branch Manager. Registration stays blocked until decided.',
      data: row,
      ...deriveIdentityNextAction(row),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Customers] POST /identity-verifications error:', err.message);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Failed to request verification.',
      data: err.existingId ? { verification_id: err.existingId } : undefined,
    });
  } finally {
    client.release();
  }
});

router.post('/identity-verifications/:id/decide', allow(ROLE_SETS.branchOps), async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const verificationId = Number(req.params.id);
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM customer_identity_verifications WHERE verification_id = $1 FOR UPDATE`,
      [verificationId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Identity verification not found.' });
    }
    if (!assertSameBranch(res, req.currentUser, existing.rows[0].branch_id)) {
      await client.query('ROLLBACK');
      return;
    }
    const decided = await decideIdentityVerification(client, {
      verificationId,
      decision: req.body?.decision,
      note: req.body?.note || req.body?.remarks,
      decidedBy: req.currentUser.id,
      matchCustomerId: req.body?.match_customer_id || req.body?.customer_id || null,
    });
    await client.query('COMMIT');

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Identity Verification',
      action: decided.status === 'Same Person' ? 'Confirm Same Person'
        : decided.status === 'Different Person' ? 'Clear Duplicate Flag'
          : `Identity ${decided.status}`,
      description: `Decided identity verification #${verificationId}: ${decided.status}.`,
      status: decided.status === 'Same Person' ? AUDIT_STATUS.APPROVED : AUDIT_STATUS.UPDATED,
      affectedRecord: `identity_verification:${verificationId}`,
    });

    const message = decided.status === 'Same Person'
      ? 'Confirmed same person. Sales Agent will be directed to the existing customer profile.'
      : decided.status === 'Different Person'
        ? 'Duplicate flag cleared. Sales Agent may proceed with new registration.'
        : decided.status === 'Needs Evidence'
          ? 'Requested further evidence. Sales Agent remains on the waiting screen.'
          : `Identity verification updated (${decided.status}).`;

    return res.json({
      success: true,
      message,
      data: decided,
      clearance_token: decided.clearance_token || null,
      primary_match_customer_id: decided.primary_match_customer_id,
      next_action: decided.next_action || null,
      same_branch: decided.same_branch,
      cross_branch: decided.cross_branch,
      display_status: decided.display_status,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Customers] POST /identity-verifications/:id/decide error:', err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to decide verification.' });
  } finally {
    client.release();
  }
});

/** BM: create branch transfer for a cross-branch candidate and link it to the identity ticket. */
router.post('/identity-verifications/:id/request-transfer', allow(ROLE_SETS.branchOps), async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const verificationId = Number(req.params.id);
    const matchCustomerId = Number(req.body?.match_customer_id || req.body?.customer_id);
    const targetBranchId = Number(req.body?.target_branch_id || req.currentUser?.branchId);
    if (!Number.isInteger(matchCustomerId) || matchCustomerId <= 0) {
      return res.status(400).json({ success: false, message: 'match_customer_id is required.' });
    }
    if (!Number.isInteger(targetBranchId) || targetBranchId <= 0) {
      return res.status(400).json({ success: false, message: 'target_branch_id is required.' });
    }

    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM customer_identity_verifications WHERE verification_id = $1 FOR UPDATE`,
      [verificationId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Identity verification not found.' });
    }
    if (!assertSameBranch(res, req.currentUser, existing.rows[0].branch_id)) {
      await client.query('ROLLBACK');
      return;
    }

    const transfer = await createBranchTransferRequest(client, {
      customerId: matchCustomerId,
      targetBranchId,
      requestedBy: req.currentUser.id,
      reason: req.body?.reason || 'BM routed possible match to Customer Branch Transfer.',
    });

    const linked = await linkBranchTransferToIdentity(client, {
      verificationId,
      matchCustomerId,
      transferId: transfer.transfer_id,
      decidedBy: req.currentUser.id,
      note: req.body?.note || req.body?.reason || null,
    });
    await client.query('COMMIT');

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Identity Verification',
      action: 'Request Branch Transfer From Identity',
      description: `Linked identity #${verificationId} to branch transfer #${transfer.transfer_id}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `identity_verification:${verificationId}`,
    });

    const full = await getIdentityVerificationById(req.app.locals.pool, verificationId);
    return res.status(201).json({
      success: true,
      message: 'Branch transfer requested. Source BM must set territory and submit to OM.',
      data: full || linked,
      transfer,
      ...deriveIdentityNextAction(full || linked),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Customers] POST /identity-verifications/:id/request-transfer error:', err.message);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Failed to request branch transfer.',
      data: err.existingId ? { transfer_id: err.existingId } : undefined,
    });
  } finally {
    client.release();
  }
});

/**
 * Read-only candidate profile for identity review (allows cross-branch candidates
 * listed on a ticket owned by the BM's branch). Does not mutate customer data.
 */
router.get(
  '/identity-verifications/:id/candidates/:customerId',
  allow(ROLE_SETS.branchOps),
  async (req, res) => {
    try {
      const verificationId = Number(req.params.id);
      const customerId = Number(req.params.customerId);
      if (!Number.isInteger(verificationId) || verificationId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid verification id.' });
      }
      if (!Number.isInteger(customerId) || customerId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid customer id.' });
      }

      const ticket = await getIdentityVerificationById(req.app.locals.pool, verificationId);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Identity verification not found.' });
      }
      if (!assertSameBranch(res, req.currentUser, ticket.branch_id)) return;

      const candidates = Array.isArray(ticket.match_candidates_json)
        ? ticket.match_candidates_json
        : [];
      const listed = candidates.some((c) => Number(c.customer_id) === customerId);
      if (!listed) {
        return res.status(403).json({
          success: false,
          message: 'Customer is not a candidate on this verification request.',
        });
      }

      const customerResult = await req.app.locals.pool.query(
        `SELECT ${CUSTOMER_SELECT_CORE}
         FROM customers c
         LEFT JOIN branches b ON b.id = c.branch_id
         LEFT JOIN users mgr ON mgr.id = c.account_manager_id
         LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
         LEFT JOIN territories t ON t.territory_id = c.territory_id
         WHERE c.customer_id = $1`,
        [customerId]
      );
      if (!customerResult.rows.length) {
        return res.status(404).json({ success: false, message: 'Customer not found.' });
      }
      const customer = customerResult.rows[0];
      const canFinance = canViewCustomerFinancialDetails(req.currentUser?.roleSlug);

      let activity = null;
      let credit = null;
      if (canFinance) {
        try {
          const act = await req.app.locals.pool.query(
            `SELECT outstanding_balance, purchase_volume, last_collection_date, last_sales_visit
             FROM customer_activity WHERE customer_id = $1`,
            [customerId]
          );
          activity = act.rows[0] || null;
        } catch { /* optional table */ }
        try {
          const cr = await req.app.locals.pool.query(
            `SELECT credit_limit, credit_status, available_credit
             FROM customer_credit_info WHERE customer_id = $1`,
            [customerId]
          );
          credit = cr.rows[0] || null;
        } catch { /* optional table */ }
      }

      const candidateMeta = candidates.find((c) => Number(c.customer_id) === customerId) || {};
      return res.json({
        success: true,
        data: {
          ...customer,
          contact_phone: undefined,
          contact_phone_masked: maskPhone(customer.contact_phone),
          contact_person_phone: canFinance ? customer.contact_person_phone : undefined,
          id_number: canFinance ? customer.id_number : undefined,
          id_photo: undefined,
          match_tier: candidateMeta.match_tier || null,
          match_reasons: candidateMeta.match_reasons || [],
          same_branch: Number(customer.branch_id) === Number(ticket.branch_id),
          cross_branch: Number(customer.branch_id) !== Number(ticket.branch_id),
          verification_id: verificationId,
          activity: canFinance ? activity : null,
          credit: canFinance ? credit : null,
          read_only: true,
        },
      });
    } catch (err) {
      console.error('[Customers] GET identity candidate profile error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load candidate profile.' });
    }
  }
);

router.get('/branch-transfers', allow(ROLE_SETS.customerRead, ROLE_SETS.branchOps), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const branchId = isUnscoped(req.currentUser) ? null : req.currentUser.branchId;
    const rows = await listBranchTransfers(pool, {
      branchId,
      status: req.query.status || null,
      forOm: false,
      limit: req.query.limit,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Customers] GET /branch-transfers error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load branch transfers.' });
  }
});

router.post('/:id/branch-transfer-requests', async (req, res) => {
  const customerId = Number(req.params.id);
  const targetBranchId = Number(req.body?.target_branch_id || req.currentUser?.branchId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid customer id.' });
  }
  if (!Number.isInteger(targetBranchId) || targetBranchId <= 0) {
    return res.status(400).json({ success: false, message: 'target_branch_id is required.' });
  }
  const client = await req.app.locals.pool.connect();
  try {
    await client.query('BEGIN');
    // SA/BM may request transfer of a cross-branch customer they discovered via lookup.
    // Source BM ownership is enforced when submitting territory details.
    const transfer = await createBranchTransferRequest(client, {
      customerId,
      targetBranchId,
      requestedBy: req.currentUser.id,
      reason: req.body?.reason || null,
    });
    await client.query('COMMIT');

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Branch Transfer',
      action: 'Request Branch Transfer',
      description: `Requested branch transfer #${transfer.transfer_id} for customer ${customerId}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `customer_branch_transfer:${transfer.transfer_id}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Branch transfer requested. Source Branch Manager must set territory and submit to OM.',
      data: transfer,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Customers] POST /:id/branch-transfer-requests error:', err.message);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Failed to request branch transfer.',
      data: err.existingId ? { transfer_id: err.existingId } : undefined,
    });
  } finally {
    client.release();
  }
});

router.get('/branch-transfers/:id/target-territories', allow(ROLE_SETS.branchOps), async (req, res) => {
  try {
    const transferId = Number(req.params.id);
    const existing = await req.app.locals.pool.query(
      `SELECT transfer_id, source_branch_id, target_branch_id, status
       FROM customer_branch_transfers WHERE transfer_id = $1`,
      [transferId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }
    const row = existing.rows[0];
    // Source BM (or OM) may list receiving-branch territories for this open transfer only.
    if (!assertSameBranch(res, req.currentUser, row.source_branch_id)) return;
    const terr = await req.app.locals.pool.query(
      `SELECT territory_id, territory_name, branch_id, barangay_name, COALESCE(status, 'Active') AS status
       FROM territories
       WHERE branch_id = $1 AND COALESCE(status, 'Active') = 'Active'
       ORDER BY territory_name ASC`,
      [row.target_branch_id]
    );
    return res.json({ success: true, data: terr.rows });
  } catch (err) {
    console.error('[Customers] GET /branch-transfers/:id/target-territories error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load territories.' });
  }
});

router.post('/branch-transfers/:id/source-submit', allow(ROLE_SETS.branchOps), async (req, res) => {
  const transferId = Number(req.params.id);
  const client = await req.app.locals.pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM customer_branch_transfers WHERE transfer_id = $1 FOR UPDATE`,
      [transferId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }
    if (!assertSameBranch(res, req.currentUser, existing.rows[0].source_branch_id)) {
      await client.query('ROLLBACK');
      return;
    }
    const transfer = await sourceBmSubmitTransfer(client, {
      transferId,
      sourceBmId: req.currentUser.id,
      targetTerritoryId: Number(req.body?.target_territory_id),
      reason: req.body?.reason,
    });
    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Transfer submitted to Operating Manager for approval.',
      data: transfer,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to submit transfer.' });
  } finally {
    client.release();
  }
});

router.post('/branch-transfers/:id/om-decide', allow(ROLE_SETS.org), async (req, res) => {
  const transferId = Number(req.params.id);
  const client = await req.app.locals.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await omDecideTransfer(client, {
      transferId,
      decision: req.body?.decision,
      note: req.body?.note || req.body?.remarks,
      omUserId: req.currentUser.id,
      assignedSalesAgentId: req.body?.assigned_sales_agent_id
        ? Number(req.body.assigned_sales_agent_id)
        : null,
    });

    // Keep linked identity tickets in sync so SA waiting screens can resolve.
    if (result.applied) {
      await client.query(
        `UPDATE customer_identity_verifications
         SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
         WHERE linked_transfer_id = $1 AND status = 'Transfer Linked'`,
        [transferId]
      );
    } else if (result.transfer?.status === 'Rejected') {
      await client.query(
        `UPDATE customer_identity_verifications
         SET decision_note = COALESCE(decision_note, '') || $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE linked_transfer_id = $1 AND status = 'Transfer Linked'`,
        [transferId, `\nTransfer rejected: ${req.body?.note || req.body?.remarks || ''}`.trim()]
      );
    }

    await client.query('COMMIT');

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Branch Transfer',
      action: `OM ${String(req.body?.decision || '').trim()}`,
      description: `OM decided branch transfer #${transferId}.`,
      status: result.applied ? AUDIT_STATUS.APPROVED : AUDIT_STATUS.UPDATED,
      affectedRecord: `customer_branch_transfer:${transferId}`,
    });

    return res.json({
      success: true,
      message: result.applied
        ? 'Branch transfer approved. Customer is now in the receiving branch.'
        : `Transfer updated (${result.transfer.status}).`,
      data: result.transfer,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to decide transfer.' });
  } finally {
    client.release();
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const customerResult = await pool.query(
      `SELECT
         ${CUSTOMER_SELECT_CORE}
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       WHERE c.customer_id = $1`,
      [req.params.id]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    if (!assertSameBranch(res, req.currentUser, customerResult.rows[0].branch_id)) return;

    let activityResult = { rows: [] };
    let creditResult = { rows: [] };
    let paymentsResult = { rows: [] };

    try {
      const tableCheck = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_activity')`);
      if (tableCheck.rows[0]?.exists) {
        activityResult = await pool.query(`SELECT * FROM customer_activity WHERE customer_id = $1`, [req.params.id]);
      }
    } catch (err) {
      console.error('[Customers] customer_activity lookup failed:', err.message);
    }

    try {
      const tableCheck = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_credit_info')`);
      if (tableCheck.rows[0]?.exists) {
        creditResult = await pool.query(
          `SELECT cci.*, u.full_name AS approved_by_name
           FROM customer_credit_info cci
           LEFT JOIN users u ON u.id = cci.approved_by
           WHERE cci.customer_id = $1`,
          [req.params.id]
        );
      }
    } catch (err) {
      console.error('[Customers] customer_credit_info lookup failed:', err.message);
    }

    try {
      const tableCheck = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_methods')`);
      if (tableCheck.rows[0]?.exists) {
        paymentsResult = await pool.query(
          `SELECT cp.collectionpayment_id AS payment_id,
                  cp.receipt_number,
                  cp.amount,
                  cp.payment_date,
                  cp.status             AS payment_status,
                  cp.notes,
                  pm.method_name        AS payment_method,
                  u.full_name           AS collector_name
           FROM collection_payment cp
           LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
           LEFT JOIN users u ON u.id = cp.collector_id
           WHERE cp.customer_id = $1
           ORDER BY cp.payment_date DESC
           LIMIT 30`,
          [req.params.id]
        );
      }
    } catch (err) {
      console.error('[Customers] payments lookup failed:', err.message);
    }

    let recentSales = [];
    let unpaidInvoiceCount = 0;
    let hasOverdueInvoice = false;
    let earliestDueDate = null;
    let lastFieldVisitDate = null;
    let todayVisit = null;
    try {
      const [salesResult, countResult, overdue, earliestDueRes, lastVisitRes, todayVisitRes] = await Promise.all([
        pool.query(
          `SELECT si.sales_invoices_id,
                  si.invoice_number,
                  si.total_amount,
                  si.status,
                  si.invoices_date::text AS invoices_date,
                  si.due_date::text AS due_date,
                  si.pay_type,
                  GREATEST(0, si.total_amount - COALESCE(ip.paid, 0))::float AS balance
           FROM sales_invoices si
           LEFT JOIN (
             SELECT sales_id, COALESCE(SUM(payment_amount), 0) AS paid
             FROM credit_history WHERE sales_id IS NOT NULL GROUP BY sales_id
           ) ip ON ip.sales_id = si.sales_invoices_id
           WHERE si.customer_id = $1
             AND si.status IN ('Pending Review', 'Confirmed')
           ORDER BY si.invoices_date DESC, si.sales_invoices_id DESC
           LIMIT 10`,
          [req.params.id]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM sales_invoices si
           LEFT JOIN (
             SELECT sales_id, COALESCE(SUM(payment_amount), 0) AS paid
             FROM credit_history WHERE sales_id IS NOT NULL GROUP BY sales_id
           ) ip ON ip.sales_id = si.sales_invoices_id
           WHERE si.customer_id = $1
             AND si.status IN ('Pending Review', 'Confirmed')
             AND COALESCE(ip.paid, 0) < si.total_amount`,
          [req.params.id]
        ),
        pool.query(
          `SELECT EXISTS (
             SELECT 1
             FROM sales_invoices si
             LEFT JOIN (
               SELECT sales_id, SUM(payment_amount) AS paid
               FROM credit_history
               WHERE sales_id IS NOT NULL
               GROUP BY sales_id
             ) paid ON paid.sales_id = si.sales_invoices_id
             WHERE si.customer_id = $1
               AND si.status IN ('Confirmed', 'Pending Review')
               AND si.due_date IS NOT NULL
               AND si.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
               AND COALESCE(paid.paid, 0) < si.total_amount
           ) AS has_overdue`,
          [req.params.id]
        ),
        pool.query(
          `SELECT TO_CHAR(MIN(si.due_date), 'YYYY-MM-DD') AS earliest_due_date
           FROM sales_invoices si
           LEFT JOIN (
             SELECT sales_id, COALESCE(SUM(payment_amount), 0) AS paid
             FROM credit_history WHERE sales_id IS NOT NULL GROUP BY sales_id
           ) ip ON ip.sales_id = si.sales_invoices_id
           WHERE si.customer_id = $1
             AND si.status IN ('Pending Review', 'Confirmed')
             AND si.due_date IS NOT NULL
             AND COALESCE(ip.paid, 0) < si.total_amount`,
          [req.params.id]
        ),
        pool.query(
          `SELECT TO_CHAR(MAX(scheduled_date), 'YYYY-MM-DD') AS last_visit_date
           FROM field_visits
           WHERE customer_id = $1
             AND status = 'Completed'
             AND visit_type = 'Collection'`,
          [req.params.id]
        ),
        req.currentUser?.id
          ? pool.query(
              `SELECT visit_id, customer_id, visit_type, scheduled_date::text AS scheduled_date,
                      status, visit_outcome, visit_remarks, visited_at
               FROM field_visits
               WHERE customer_id = $1
                 AND user_id = $2
                 AND visit_type = 'Collection'
                 AND scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
               ORDER BY visit_id DESC
               LIMIT 1`,
              [req.params.id, req.currentUser.id]
            )
          : Promise.resolve({ rows: [] }),
      ]);
      recentSales = salesResult.rows;
      unpaidInvoiceCount = countResult.rows[0]?.count || 0;
      hasOverdueInvoice = Boolean(overdue.rows[0]?.has_overdue);
      earliestDueDate = earliestDueRes.rows[0]?.earliest_due_date || null;
      lastFieldVisitDate = lastVisitRes.rows[0]?.last_visit_date || null;
      todayVisit = todayVisitRes.rows[0] || null;
    } catch (err) {
      console.error('[Customers] recent sales lookup failed:', err.message);
    }

    const outstandingBalance = Number(activityResult.rows[0]?.outstanding_balance) || 0;
    const creditLimit = Number(creditResult.rows[0]?.credit_limit) || 0;
    const canViewFinancialDetails = canViewCustomerFinancialDetails(req.currentUser?.roleSlug);
    const paymentStatus = paymentStandingFromFlags({
      outstandingBalance,
      hasOverdueInvoice,
    });
    let daysOverdue = 0;
    if (hasOverdueInvoice && earliestDueDate) {
      const manilaToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const diff = Math.floor(
        (new Date(`${manilaToday}T12:00:00`) - new Date(`${earliestDueDate}T12:00:00`)) / 86400000
      );
      daysOverdue = Math.max(0, diff);
    }

    const activity = activityResult.rows[0] || null;
    const creditInfo = creditResult.rows[0]
      ? {
        ...creditResult.rows[0],
        approved_credit_limit: creditLimit,
        available_credit: creditLimit - outstandingBalance,
      }
      : {
        credit_limit: 0,
        approved_credit_limit: 0,
        available_credit: -outstandingBalance,
      };

    return res.status(200).json({
      success: true,
      data: {
        ...customerResult.rows[0],
        activity: canViewFinancialDetails ? activity : (activity ? {
          outstanding_balance: activity.outstanding_balance,
          purchase_volume: activity.purchase_volume,
          updated_at: activity.updated_at,
        } : null),
        creditInfo,
        paymentHistory: canViewFinancialDetails ? paymentsResult.rows : [],
        recentSales: canViewFinancialDetails ? recentSales : [],
        unpaidInvoiceCount,
        hasOverdueInvoice,
        earliestDueDate,
        lastFieldVisitDate,
        todayVisit,
        outstandingBalance,
        outstanding_balance: outstandingBalance,
        approved_credit_limit: creditLimit,
        available_credit: creditLimit - outstandingBalance,
        daysOverdue,
        paymentStatus,
        paymentStanding: paymentStatus,
      },
    });
  } catch (err) {
    console.error('[Customers] GET /:id error:', err.message);
    console.error('[Customers] GET /:id stack:', err.stack);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer.' });
  }
});

router.post('/', async (req, res) => {
  const {
    first_name, middle_name, last_name, name_suffix, mothers_maiden_name, civil_status,
    address, latitude, longitude,
    address_region, address_province, address_city, address_barangay, address_street, address_zip,
    contact_phone, contact_person_fname, contact_person_mname, contact_person_lname,
    contact_person_phone, contact_person_relationship,
    secondary_contact_fname, secondary_contact_lname,
    secondary_contact_phone, secondary_contact_relationship,
    branch_id, territory_id, account_manager_id, status,
    create_portal_account, portal_email,
    id_type, id_number, id_photo,
    customer_type: customerTypeRaw,
    business_name: businessNameRaw,
    registration_profile: registrationProfileRaw,
    source_assignment_id: sourceAssignmentIdRaw,
    territory_override_note: territoryOverrideNoteRaw,
    estimated_monthly_revenue: estimatedMonthlyRevenueRaw,
    estimated_monthly_expenses: estimatedMonthlyExpensesRaw,
    existing_obligations: existingObligationsRaw,
    request_credit: requestCreditRaw,
    requested_credit_limit: requestedCreditLimitRaw,
    credit_request_reason: creditRequestReasonRaw,
    credit_request_remarks: creditRequestRemarksRaw,
    acknowledge_duplicate: acknowledgeDuplicateRaw,
    privacy_notice_acknowledged: privacyNoticeAcknowledgedRaw,
    privacy_notice_version: privacyNoticeVersionRaw,
    marketing_opt_in: marketingOptInRaw,
    phone_verification_status: phoneVerificationStatusRaw,
    cash_registration: cashRegistrationRaw,
    identity_clearance_token: identityClearanceTokenRaw,
  } = req.body;

  const isSalesAgent = req.currentUser?.roleSlug === 'sales_staff';
  const actorBranchId = req.currentUser?.branchId != null ? Number(req.currentUser.branchId) : null;
  // Branch ownership is never inferred from GPS. Sales / BM / collector always
  // inherit the authenticated user's branch. Only unscoped roles may set branch_id.
  let resolvedBranchId = null;
  if (isSalesAgent || req.currentUser?.roleSlug === 'branch_manager' || req.currentUser?.roleSlug === 'collector') {
    resolvedBranchId = actorBranchId;
  } else if (!isUnscoped(req.currentUser) && actorBranchId != null) {
    resolvedBranchId = actorBranchId;
  } else if (branch_id != null && branch_id !== '') {
    resolvedBranchId = Number(branch_id);
  } else {
    resolvedBranchId = actorBranchId;
  }

  const addressParts = {
    address_region: cleanPart(address_region),
    address_province: cleanPart(address_province),
    address_city: cleanPart(address_city),
    address_barangay: cleanPart(address_barangay),
    address_street: cleanPart(address_street),
    address_zip: cleanPart(address_zip),
  };
  const composedAddress = composeAddress(addressParts) || cleanPart(address);

  const cashRegistration = Boolean(cashRegistrationRaw)
    || String(cashRegistrationRaw || '').toLowerCase() === 'true'
    || isSalesAgent;
  // Sales Agent cash registration always creates natural-person records.
  const customerType = (cashRegistration || String(customerTypeRaw || 'Individual').trim() !== 'Business')
    ? 'Individual'
    : 'Business';
  const businessName = cleanPart(businessNameRaw);
  const maidenName = cashRegistration ? null : cleanPart(mothers_maiden_name);
  const civilStatus = cashRegistration ? null : cleanPart(civil_status);
  const nameSuffix = cleanPart(name_suffix);
  const resolvedFirstName = cleanPart(first_name)
    || (customerType === 'Business' ? cleanPart(contact_person_fname) : '');
  const resolvedLastName = cleanPart(last_name)
    || (customerType === 'Business' ? cleanPart(contact_person_lname) : '');
  const alternateFirstName = cashRegistration ? null : cleanPart(contact_person_fname);
  const alternateMiddleName = cashRegistration ? null : cleanPart(contact_person_mname);
  const alternateLastName = cashRegistration ? null : cleanPart(contact_person_lname);
  const alternatePhone = cashRegistration ? null : cleanPart(contact_person_phone);
  const alternateRelationship = cashRegistration ? null : cleanPart(contact_person_relationship);

  if (customerType === 'Business' && !businessName) {
    return res.status(400).json({ success: false, message: 'Business name is required for business customers.' });
  }
  if (!resolvedFirstName || !resolvedLastName || !composedAddress || !contact_phone) {
    return res.status(400).json({ success: false, message: 'All required customer fields must be provided.' });
  }
  if (!cashRegistration && customerType === 'Individual') {
    if (civilStatus && !CIVIL_STATUSES.has(civilStatus)) {
      return res.status(400).json({ success: false, message: 'A valid civil status is required.' });
    }
  }
  if (!addressParts.address_province || !addressParts.address_city || !addressParts.address_barangay) {
    return res.status(400).json({
      success: false,
      message: 'Province, city/municipality, and barangay are required.',
    });
  }
  if (cashRegistration && !addressParts.address_street) {
    return res.status(400).json({
      success: false,
      message: 'House number / street / landmark is required.',
    });
  }

  const privacyAcknowledged = Boolean(privacyNoticeAcknowledgedRaw)
    || String(privacyNoticeAcknowledgedRaw || '').toLowerCase() === 'true'
    || Boolean(req.body?.privacy_notice_acknowledged_at);
  if (cashRegistration && !privacyAcknowledged) {
    return res.status(400).json({
      success: false,
      message: 'CORVEX Privacy Notice acknowledgment is required before registration.',
    });
  }
  const privacyVersion = cleanPart(privacyNoticeVersionRaw) || 'corvex-privacy-2026';
  const marketingOptIn = Boolean(marketingOptInRaw)
    || String(marketingOptInRaw || '').toLowerCase() === 'true';
  const phoneVerificationStatus = String(phoneVerificationStatusRaw || 'Unverified').trim() === 'Verified'
    ? 'Verified'
    : 'Unverified';

  if (!cashRegistration) {
    const customerFullName = [resolvedFirstName, middle_name, resolvedLastName].filter(Boolean).join(' ');
    const contactFullName = [contact_person_fname, contact_person_mname, contact_person_lname].filter(Boolean).join(' ');
    const alternateContactProvided = Boolean(
      contact_person_fname || contact_person_mname || contact_person_lname
        || contact_person_phone || contact_person_relationship
    );
    if (alternateContactProvided && (!contact_person_fname || !contact_person_lname
      || !contact_person_phone || !contact_person_relationship)) {
      return res.status(400).json({
        success: false,
        message: 'Complete all alternate contact fields or leave the alternate contact blank.',
      });
    }
    if (alternateContactProvided && customerType === 'Individual'
      && (namesMatchCustomer(customerFullName, contactFullName) || phonesMatch(contact_phone, contact_person_phone))) {
      return res.status(400).json({
        success: false,
        message: 'Primary contact must be someone else to call when the customer is unreachable.',
      });
    }
  }

  const idType = cashRegistration ? '' : (typeof id_type === 'string' ? id_type.trim() : '');
  const idNumber = cashRegistration ? '' : (typeof id_number === 'string' ? id_number.trim() : '');
  // Credit is a separate process for SA cash registration.
  const wantsCredit = cashRegistration
    ? false
    : (Boolean(requestCreditRaw)
      || String(requestCreditRaw || '').toLowerCase() === 'true'
      || String(req.body?.apply_for_credit || '').toLowerCase() === 'true');
  if (customerType === 'Individual' && wantsCredit) {
    if (!idType || !GOVERNMENT_ID_TYPES.has(idType)) {
      return res.status(400).json({ success: false, message: 'A valid government ID type is required.' });
    }
    if (!idNumber) {
      return res.status(400).json({ success: false, message: 'Government ID number is required.' });
    }
  }

  if (!resolvedBranchId || !Number.isFinite(resolvedBranchId)) {
    return res.status(400).json({ success: false, message: 'branch_id is required to create a customer.' });
  }
  if ((isSalesAgent || req.currentUser?.roleSlug === 'branch_manager') && actorBranchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned. Cannot create a customer.' });
  }

  // A supplied portal email explicitly requests an activation workflow; no default
  // password is ever created and the invitation remains linked to this customer.
  const portalRequested = Boolean(String(portal_email || '').trim());
  if (portalRequested && !isMailConfigured()) {
    return res.status(503).json({ success: false, message: PORTAL_EMAIL_NOT_CONFIGURED });
  }

  let idPhotoValue = null;
  try {
    idPhotoValue = normalizeIdPhoto(id_photo) ?? null;
  } catch (photoError) {
    return res.status(400).json({ success: false, message: photoError.message });
  }

  const client = await req.app.locals.pool.connect();

  try {
    const lat = parseOptionalCoord(latitude);
    const lng = parseOptionalCoord(longitude);

    await client.query('BEGIN');

    let resolvedTerritoryId = territory_id ? Number(territory_id) : null;
    const customerFullNameForLookup = [resolvedFirstName, middle_name, resolvedLastName]
      .filter(Boolean)
      .join(' ');

    let identityMatchJson = {};
    let customerStatus = isSalesAgent ? 'Active' : (status || 'Active');
    const clearanceToken = cleanPart(identityClearanceTokenRaw);

    if (cashRegistration) {
      const phoneDigits = digitsOnly(contact_phone);
      if (phoneDigits) {
        await client.query(
          'SELECT pg_advisory_xact_lock($1, $2)',
          [CUSTOMER_CREATE_PHONE_LOCK_NS, phoneAdvisoryKey(phoneDigits)]
        );
      }

      // Block create only when this SA has an open verification for the same phone
      // (same registration attempt). Other customers may still be registered.
      if (phoneDigits) {
        const openVerify = await findOpenIdentityForRequester(client, {
          requestedBy: req.currentUser.id,
          phoneNorm: phoneDigits,
        });
        if (openVerify && !clearanceToken) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: 'You have a pending Branch Manager identity verification for this phone. Resume that request or wait for the decision.',
            code: 'IDENTITY_VERIFICATION_PENDING',
            data: { verification_id: Number(openVerify.verification_id) },
          });
        }
      }

      const dup = await findCustomerDuplicates(client, {
        contact_phone: contact_phone.trim(),
        portal_email: portal_email,
        name: customerFullNameForLookup,
        address_barangay: addressParts.address_barangay,
        address: composedAddress,
        customer_code: req.body?.customer_code,
        id_number: idNumber || req.body?.id_number,
      }, { actorBranchId: resolvedBranchId });

      const exactMatches = (dup.matches || []).filter((m) => m.match_tier === 'exact');
      const possibleMatches = (dup.matches || []).filter((m) => m.match_tier === 'possible');

      if (exactMatches.length) {
        await client.query('ROLLBACK');
        const primary = exactMatches[0];
        return res.status(409).json({
          success: false,
          message: primary.same_branch
            ? 'An exact customer match already exists in your branch. Open the existing profile instead of creating a duplicate.'
            : 'An exact customer match exists in another branch. Request a branch transfer — do not create a duplicate.',
          code: primary.same_branch ? 'EXACT_SAME_BRANCH' : 'EXACT_CROSS_BRANCH',
          match_summary: 'exact',
          matches: exactMatches.map(limitedMatchCard),
          data: limitedMatchCard(primary),
        });
      }

      if (possibleMatches.length) {
        if (!clearanceToken) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: 'Possible duplicate detected. Request Branch Manager identity verification before registering. Do not create another account.',
            code: 'REQUIRES_IDENTITY_VERIFICATION',
            match_summary: 'possible',
            matches: possibleMatches.map(limitedMatchCard),
          });
        }
        await consumeClearanceToken(client, clearanceToken, resolvedBranchId);
      } else if (clearanceToken) {
        // Clearance provided but no longer needed — consume to prevent reuse.
        try { await consumeClearanceToken(client, clearanceToken, resolvedBranchId); } catch { /* ignore */ }
      }
    }

    const requiresTerritory = customerStatus === 'Active' || customerStatus === 'Pending Identity Review';
    if (requiresTerritory && !resolvedTerritoryId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Customer must be assigned to an Active territory in the same branch.',
      });
    }

    if (resolvedTerritoryId) {
      const territoryCheck = await client.query(
        `SELECT territory_id, branch_id, COALESCE(status, 'Active') AS status
         FROM territories
         WHERE territory_id = $1`,
        [resolvedTerritoryId]
      );
      if (!territoryCheck.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Territory not found.' });
      }
      if (Number(territoryCheck.rows[0].branch_id) !== Number(resolvedBranchId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Territory belongs to a different branch than the customer.',
        });
      }
      if (requiresTerritory && territoryCheck.rows[0].status !== 'Active') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Customers can only be assigned to Active territories.',
        });
      }
    }

    const assignedSalesAgentId = isSalesAgent
      ? req.currentUser.id
      : null;

    // Permanent Account Manager is the Collector relationship — not the creating Sales Agent
    // and not the territory (geography ≠ personnel).
    let resolvedAccountManagerId = account_manager_id ? Number(account_manager_id) : null;
    if (!resolvedAccountManagerId && !isSalesAgent && req.currentUser?.roleSlug === 'collector') {
      resolvedAccountManagerId = req.currentUser.id;
    }

    const sourceAssignmentId = Number(sourceAssignmentIdRaw);
    const hasSourceAssignment = Number.isInteger(sourceAssignmentId) && sourceAssignmentId > 0;
    if (hasSourceAssignment) {
      const assignment = await client.query(
        `SELECT assignment_id, territory_id, sales_agent_id, branch_id
         FROM sales_area_assignments
         WHERE assignment_id = $1`,
        [sourceAssignmentId]
      );
      const row = assignment.rows[0];
      if (!row
        || Number(row.branch_id) !== Number(resolvedBranchId)
        || Number(row.territory_id) !== Number(resolvedTerritoryId)
        || (isSalesAgent && Number(row.sales_agent_id) !== Number(req.currentUser.id))) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'The selected territory does not match your assigned schedule.',
        });
      }
    }
    const territoryOverrideNote = cleanPart(territoryOverrideNoteRaw);
    const parseMoney = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
    };
    const estimatedMonthlyRevenue = cashRegistration ? null : parseMoney(estimatedMonthlyRevenueRaw);
    const estimatedMonthlyExpenses = cashRegistration ? null : parseMoney(estimatedMonthlyExpensesRaw);
    const existingObligations = cashRegistration ? null : parseMoney(existingObligationsRaw);
    const profileInput = registrationProfileRaw && typeof registrationProfileRaw === 'object'
      ? registrationProfileRaw
      : {};
    const registrationProfile = {
      ...profileInput,
      customer_type: customerType,
      business_name: businessName || null,
      estimated_monthly_revenue: estimatedMonthlyRevenue,
      estimated_monthly_expenses: estimatedMonthlyExpenses,
      existing_obligations: existingObligations,
      requested_credit_limit: cashRegistration ? null : parseMoney(requestedCreditLimitRaw),
      preferred_payment_terms: profileInput.preferred_payment_terms || null,
      business_type: profileInput.business_type || null,
      business_category: profileInput.business_category || null,
      years_of_operation: profileInput.years_of_operation != null
        ? Number(profileInput.years_of_operation) : null,
      store_type: profileInput.store_type || null,
      supplier_references: profileInput.supplier_references || null,
      evidence_photos: Array.isArray(profileInput.evidence_photos)
        ? profileInput.evidence_photos.slice(0, 3)
        : [],
      acknowledge_duplicate: Boolean(acknowledgeDuplicateRaw),
      cash_registration: Boolean(cashRegistration),
      territory_outside_review: Boolean(territoryOverrideNote) || Boolean(profileInput.territory_outside_review),
      account_eligibility: 'Cash',
    };

    const result = await client.query(
      `INSERT INTO customers
        (branch_id, account_manager_id, assigned_sales_agent_id, territory_id,
         first_name, middle_name, last_name, name_suffix, mothers_maiden_name, civil_status, address,
         address_region, address_province, address_city, address_barangay, address_street, address_zip,
         latitude, longitude,
         contact_phone, contact_person_fname, contact_person_mname, contact_person_lname, contact_person_phone,
         contact_person_relationship,
         secondary_contact_fname, secondary_contact_lname, secondary_contact_phone,
         secondary_contact_relationship, status,
         id_type, id_number, id_photo, id_verification_status,
         customer_type, business_name, registration_profile_json, source_assignment_id,
         territory_override_note, estimated_monthly_revenue, estimated_monthly_expenses, existing_obligations,
         privacy_notice_acknowledged_at, privacy_notice_version, marketing_opt_in,
         phone_verification_status, identity_match_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,'Unverified',$34,$35,$36::jsonb,$37,$38,$39,$40,$41,
         $42,$43,$44,$45,$46::jsonb)
       RETURNING customer_id, created_at`,
      [
        resolvedBranchId,
        resolvedAccountManagerId,
        assignedSalesAgentId,
        resolvedTerritoryId,
        resolvedFirstName,
        middle_name ? String(middle_name).trim() : null,
        resolvedLastName,
        nameSuffix || null,
        maidenName || null,
        civilStatus || null,
        composedAddress,
        addressParts.address_region,
        addressParts.address_province,
        addressParts.address_city,
        addressParts.address_barangay,
        addressParts.address_street,
        addressParts.address_zip,
        lat,
        lng,
        contact_phone.trim(),
        alternateFirstName,
        alternateMiddleName,
        alternateLastName,
        alternatePhone,
        alternateRelationship,
        cashRegistration ? null : cleanPart(secondary_contact_fname),
        cashRegistration ? null : cleanPart(secondary_contact_lname),
        cashRegistration ? null : cleanPart(secondary_contact_phone),
        cashRegistration ? null : cleanPart(secondary_contact_relationship),
        customerStatus,
        idType || null,
        idNumber || null,
        idPhotoValue,
        customerType,
        businessName || null,
        JSON.stringify(registrationProfile),
        hasSourceAssignment ? sourceAssignmentId : null,
        territoryOverrideNote || null,
        estimatedMonthlyRevenue,
        estimatedMonthlyExpenses,
        existingObligations,
        privacyAcknowledged ? new Date() : null,
        privacyAcknowledged ? privacyVersion : null,
        marketingOptIn,
        phoneVerificationStatus,
        JSON.stringify(identityMatchJson),
      ]
    );

    const customerId = result.rows[0].customer_id;
    const createdAt = result.rows[0].created_at || new Date();
    const generatedCode = `C-${String(customerId).padStart(3, '0')}-${new Date(createdAt).getFullYear()}`;
    await client.query(
      `UPDATE customers SET customer_code = $1 WHERE customer_id = $2`,
      [generatedCode, customerId]
    );

    await client.query(
      `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume)
       VALUES ($1, 0, 0)
       ON CONFLICT (customer_id) DO NOTHING`,
      [customerId]
    );

    let creditReview = null;
    if (wantsCredit) {
      const reason = String(creditRequestReasonRaw || 'First installment').trim() || 'First installment';
      const createdCi = await createCreditReview(client, {
        customerId,
        branchId: resolvedBranchId,
        submittedBy: req.currentUser.id,
        requestReason: reason,
        requestedCreditLimit: requestedCreditLimitRaw,
        requestRemarks: String(creditRequestRemarksRaw || '').trim()
          || 'Submitted with customer registration.',
      });
      creditReview = createdCi;
    }

    let portalMeta = null;
    if (portalRequested) {
      portalMeta = await createPortalInvitation(client, {
        customerId,
        branchId: resolvedBranchId,
        portalEmail: portal_email,
        contactFirstName: contact_person_fname,
        contactLastName: contact_person_lname,
      });
      console.log(`[CustomerPortal] Invitation created for customer ${customerId}: ${portalMeta.activationUrl}`);
    } else {
      await client.query(
        `UPDATE customers SET portal_status = 'none' WHERE customer_id = $1 AND (portal_status IS NULL OR portal_status = 'none')`,
        [customerId]
      );
    }

    await client.query('COMMIT');

    let emailResult = null;
    if (portalMeta) {
      const agentContact = await loadSalesAgentContact(req.app.locals.pool, req.currentUser?.id);
      emailResult = await dispatchPortalActivationEmail(req.app.locals.pool, {
        portalMeta,
        customerFirstName: contact_person_fname,
        salesAgentName: agentContact.name || salesAgentDisplayName(req.currentUser),
        salesAgentEmail: agentContact.email || undefined,
        branchId: resolvedBranchId,
      });
    }

    const detail = await req.app.locals.pool.query(
      `SELECT ${CUSTOMER_SELECT_CORE}
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       WHERE c.customer_id = $1`,
      [customerId]
    );

    const portalPayload = portalMeta ? buildPortalApiPayload(portalMeta, emailResult) : null;

    let createMessage = 'Customer created.';
    if (portalMeta) {
      const inbox = portalMeta.portalEmail;
      createMessage = emailResult?.sent
        ? `Customer created. Activation email sent to ${inbox} — the customer can open it in Gmail (or their inbox) to activate their account.`
        : `Customer created, but the activation email could not be delivered to ${inbox}. Share the activation link manually or use Resend Invitation.`;
      if (emailResult?.error) {
        createMessage += ` (${emailResult.error})`;
      }
    }

    if (creditReview?.row?.ci_id) {
      createMessage = `${createMessage.replace(/\.$/, '')}. Credit investigation #${creditReview.row.ci_id} submitted for Branch Manager review.`;
    }

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Create Customer',
      action: 'Create Customer',
      description: `Created customer ${resolvedFirstName} ${resolvedLastName}${creditReview?.row?.ci_id ? ` with CI #${creditReview.row.ci_id}` : ''}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `customer:${customerId}`,
    });

    return res.status(201).json({
      success: true,
      message: createMessage,
      data: detail.rows[0],
      portal: portalPayload,
      credit_investigation: creditReview?.row
        ? {
          ci_id: creditReview.row.ci_id,
          status: creditReview.row.status,
          requested_credit_limit: creditReview.row.requested_credit_limit,
          suggestion: creditReview.evidence?.suggestion || null,
        }
        : null,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Customers] POST / error:', err.message);
    const clientMessage = err.message || 'Failed to create customer.';
    const status = err.status || (/email|portal|valid|required/i.test(clientMessage) ? 400 : 500);
    return res.status(status).json({
      success: false,
      message: clientMessage,
      data: err.existingId ? { ci_id: err.existingId } : undefined,
    });
  } finally {
    client.release();
  }
});

router.post('/:id/identity-review', allow(ROLE_SETS.branchOps), async (req, res) => {
  const customerId = Number(req.params.id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid customer id.' });
  }
  const decision = String(req.body?.decision || '').trim().toLowerCase();
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({
      success: false,
      message: 'decision must be approve or reject.',
    });
  }
  const note = cleanPart(req.body?.note) || cleanPart(req.body?.remarks) || null;

  const client = await req.app.locals.pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT customer_id, branch_id, status, first_name, last_name, contact_phone
       FROM customers
       WHERE customer_id = $1
       FOR UPDATE`,
      [customerId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    const customer = existing.rows[0];
    if (!assertSameBranch(res, req.currentUser, customer.branch_id)) {
      await client.query('ROLLBACK');
      return;
    }
    if (String(customer.status) !== 'Pending Identity Review') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Only customers in Pending Identity Review can be decided here.',
      });
    }

    const nextStatus = decision === 'approve' ? 'Active' : 'Inactive';
    const updated = await client.query(
      `UPDATE customers
       SET status = $2,
           identity_match_json = CASE WHEN $2 = 'Active' THEN '{}'::jsonb ELSE identity_match_json END,
           identity_review_note = $3,
           identity_reviewed_by = $4,
           identity_reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $1
       RETURNING customer_id, status, identity_review_note, identity_reviewed_at`,
      [customerId, nextStatus, note, req.currentUser.id]
    );

    await resolveAlertsBySourceKey(client, `customer-identity-review:${customerId}`, {
      resolvedBy: req.currentUser.id,
      resolutionNote: decision === 'approve'
        ? (note || 'Identity review approved — customer activated.')
        : (note || 'Identity review rejected — customer set Inactive.'),
    });

    await client.query('COMMIT');

    const displayName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Identity Review',
      action: decision === 'approve' ? 'Approve Identity' : 'Reject Identity',
      description: `${decision === 'approve' ? 'Approved' : 'Rejected'} identity review for ${displayName} (#${customerId}).`,
      status: decision === 'approve' ? AUDIT_STATUS.APPROVED : AUDIT_STATUS.REJECTED,
      affectedRecord: `customer:${customerId}`,
    });

    const detail = await req.app.locals.pool.query(
      `SELECT ${CUSTOMER_SELECT_CORE}
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       WHERE c.customer_id = $1`,
      [customerId]
    );

    return res.json({
      success: true,
      message: decision === 'approve'
        ? 'Customer identity approved. Account is now Active for cash sales.'
        : 'Customer identity rejected. Account set to Inactive.',
      data: detail.rows[0] || updated.rows[0],
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Customers] POST /:id/identity-review error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to decide identity review.' });
  } finally {
    client.release();
  }
});

router.post('/:id/portal/resend', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const customerId = Number(req.params.id);
    const existing = await client.query(
      `SELECT customer_id, branch_id, portal_email, portal_status, contact_person_fname, contact_person_lname
       FROM customers WHERE customer_id = $1`,
      [customerId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    const customer = existing.rows[0];
    if (!assertSameBranch(res, req.currentUser, customer.branch_id)) return;

    const portalEmail = String(req.body?.portal_email || customer.portal_email || '').trim();
    if (!portalEmail) {
      return res.status(400).json({ success: false, message: 'Portal email is required to send an invitation.' });
    }

    if (!isMailConfigured()) {
      return res.status(503).json({ success: false, message: PORTAL_EMAIL_NOT_CONFIGURED });
    }

    await client.query('BEGIN');

    if (customer.portal_status === 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Portal account is already active for this customer.' });
    }

    const portalMeta = await resendPortalInvitation(client, { customerId, portalEmail });

    await client.query('COMMIT');

    const agentRow = await req.app.locals.pool.query(
      `SELECT agent.email AS agent_email,
              COALESCE(NULLIF(TRIM(agent.full_name), ''), CONCAT_WS(' ', agent.first_name, agent.last_name)) AS agent_name
       FROM customers c
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       WHERE c.customer_id = $1`,
      [customerId]
    );
    const emailResult = await dispatchPortalActivationEmail(req.app.locals.pool, {
      portalMeta,
      customerFirstName: customer.contact_person_fname,
      salesAgentName: agentRow.rows[0]?.agent_name || salesAgentDisplayName(req.currentUser),
      salesAgentEmail: agentRow.rows[0]?.agent_email || undefined,
      branchId: customer.branch_id,
    });

    const inbox = portalMeta.portalEmail;
    let resendMessage = emailResult?.sent
      ? `Activation email sent to ${inbox}.`
      : `Invitation renewed but email could not be delivered to ${inbox} — share the activation link manually.`;
    if (emailResult?.error) {
      resendMessage += ` (${emailResult.error})`;
    }

    return res.status(200).json({
      success: true,
      message: resendMessage,
      portal: buildPortalApiPayload(portalMeta, emailResult),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Customers] POST /:id/portal/resend error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to resend invitation.' });
  } finally {
    client.release();
  }
});

/** Protected master data — Sales Agents must use change-request / BM approval. */
const CUSTOMER_PROTECTED_FIELDS = [
  'first_name', 'middle_name', 'last_name', 'mothers_maiden_name', 'civil_status',
  'customer_type', 'business_name', 'registration_profile_json',
  'address', 'address_region', 'address_province', 'address_city', 'address_barangay',
  'address_street', 'address_zip', 'latitude', 'longitude', 'contact_phone',
  'contact_person_fname', 'contact_person_mname', 'contact_person_lname',
  'contact_person_phone', 'contact_person_relationship',
  'territory_id', 'id_type', 'id_number', 'id_photo',
  'estimated_monthly_revenue', 'estimated_monthly_expenses', 'existing_obligations',
];

/** Soft fields Sales Agents may update directly without maker-checker. */
const CUSTOMER_SOFT_FIELDS = [
  'secondary_contact_fname', 'secondary_contact_lname', 'secondary_contact_phone',
  'secondary_contact_relationship', 'portal_email',
];

const CUSTOMER_CHANGE_FIELDS = [...CUSTOMER_PROTECTED_FIELDS, ...CUSTOMER_SOFT_FIELDS];

function customerChangePatch(body = {}, { protectedOnly = false } = {}) {
  const proposed = body.proposed && typeof body.proposed === 'object' ? body.proposed : body;
  const allowed = protectedOnly ? CUSTOMER_PROTECTED_FIELDS : CUSTOMER_CHANGE_FIELDS;
  const patch = {};
  for (const field of allowed) {
    if (proposed[field] !== undefined) patch[field] = proposed[field];
  }
  return patch;
}

function customerSoftPatch(body = {}) {
  const patch = {};
  for (const field of CUSTOMER_SOFT_FIELDS) {
    if (body[field] !== undefined) patch[field] = body[field];
  }
  return patch;
}

router.post('/:id/change-requests', async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    const existing = await req.app.locals.pool.query(
      'SELECT * FROM customers WHERE customer_id = $1',
      [customerId]
    );
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Customer not found.' });
    if (!assertSameBranch(res, req.currentUser, existing.rows[0].branch_id)) return;
    if (req.currentUser?.roleSlug !== 'sales_staff') {
      return res.status(403).json({ success: false, message: 'Only Sales Agents submit customer change requests.' });
    }

    const proposed = customerChangePatch(req.body, { protectedOnly: true });
    if (!Object.keys(proposed).length) {
      return res.status(400).json({
        success: false,
        message: 'No protected customer fields were submitted. Soft fields (e.g. alternate phone) can be updated directly.',
      });
    }
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A reason is required.' });

    const credit = await req.app.locals.pool.query(
      'SELECT * FROM customer_credit_info WHERE customer_id = $1',
      [customerId]
    );
    const original = { ...existing.rows[0], credit_info: credit.rows[0] || null };
    const type = Object.prototype.hasOwnProperty.call(proposed, 'territory_id')
      || Object.prototype.hasOwnProperty.call(proposed, 'address')
      ? 'Profile'
      : 'Profile';
    const result = await req.app.locals.pool.query(
      `INSERT INTO customer_change_requests
        (customer_id, branch_id, requested_by, change_type, proposed_json, original_json, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING request_id, status, created_at`,
      [
        customerId,
        existing.rows[0].branch_id,
        req.currentUser.id,
        type,
        JSON.stringify(proposed),
        JSON.stringify(original),
        reason,
      ]
    );
    return res.status(202).json({
      success: true,
      pending: true,
      message: 'Customer change submitted for Branch Manager approval.',
      data: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A customer change request is already pending.' });
    }
    console.error('[Customers] POST /:id/change-requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit customer change.' });
  }
});

router.get('/:id/change-requests', async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    const customer = await req.app.locals.pool.query(
      'SELECT branch_id FROM customers WHERE customer_id = $1',
      [customerId]
    );
    if (!customer.rows.length) return res.status(404).json({ success: false, message: 'Customer not found.' });
    if (!assertSameBranch(res, req.currentUser, customer.rows[0].branch_id)) return;
    const result = await req.app.locals.pool.query(
      `SELECT r.*, COALESCE(NULLIF(TRIM(u.full_name), ''), CONCAT_WS(' ', u.first_name, u.last_name)) AS requester_name
       FROM customer_change_requests r
       LEFT JOIN users u ON u.id = r.requested_by
       WHERE r.customer_id = $1
       ORDER BY r.created_at DESC`,
      [customerId]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Customers] GET /:id/change-requests error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load customer change requests.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const customerId = Number(req.params.id);
    const existing = await pool.query(
      `SELECT * FROM customers WHERE customer_id = $1`,
      [customerId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    if (!assertSameBranch(res, req.currentUser, existing.rows[0].branch_id)) return;
    const before = existing.rows[0];
    const isSalesAgent = req.currentUser?.roleSlug === 'sales_staff';
    if (isSalesAgent) {
      const protectedPatch = customerChangePatch(req.body, { protectedOnly: true });
      const softPatch = customerSoftPatch(req.body);

      // Soft-only updates apply immediately.
      if (!Object.keys(protectedPatch).length && Object.keys(softPatch).length) {
        const softUpdates = [];
        const softParams = [];
        let softIdx = 1;
        for (const [col, val] of Object.entries(softPatch)) {
          softUpdates.push(`${col} = $${softIdx++}`);
          softParams.push(val === '' ? null : val);
        }
        softUpdates.push('updated_at = CURRENT_TIMESTAMP');
        softParams.push(customerId);
        const softResult = await pool.query(
          `UPDATE customers SET ${softUpdates.join(', ')} WHERE customer_id = $${softIdx} RETURNING *`,
          softParams
        );
        return res.status(200).json({
          success: true,
          message: 'Customer soft fields updated.',
          data: softResult.rows[0],
        });
      }

      if (!Object.keys(protectedPatch).length) {
        return res.status(403).json({
          success: false,
          message: 'Sales Agents cannot directly mutate protected customer master data. Submit a change request.',
        });
      }

      const reason = String(req.body.reason || 'Customer profile update requested by Sales Agent.').trim();
      const credit = await pool.query(
        'SELECT * FROM customer_credit_info WHERE customer_id = $1',
        [customerId]
      );
      try {
        const request = await pool.query(
          `INSERT INTO customer_change_requests
            (customer_id, branch_id, requested_by, change_type, proposed_json, original_json, reason)
           VALUES ($1, $2, $3, 'Profile', $4::jsonb, $5::jsonb, $6)
           RETURNING request_id, status, created_at`,
          [
            customerId,
            before.branch_id,
            req.currentUser.id,
            JSON.stringify(protectedPatch),
            JSON.stringify({ ...before, credit_info: credit.rows[0] || null }),
            reason,
          ]
        );
        return res.status(202).json({
          success: true,
          pending: true,
          message: 'Customer change submitted for Branch Manager approval. Protected fields were not applied directly.',
          data: request.rows[0],
        });
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ success: false, message: 'A customer change request is already pending.' });
        }
        throw err;
      }
    }
    const {
      first_name, middle_name, last_name, mothers_maiden_name, civil_status,
      address, latitude, longitude,
      address_region, address_province, address_city, address_barangay, address_street, address_zip,
      contact_phone, contact_person_fname, contact_person_mname, contact_person_lname,
      contact_person_phone, contact_person_relationship,
      secondary_contact_fname, secondary_contact_lname,
      secondary_contact_phone, secondary_contact_relationship,
      branch_id, territory_id, account_manager_id, status,
      id_type, id_number, id_photo, id_verification_status,
    } = req.body;

    const updates = [];
    const params = [];
    let pIdx = 1;
    const changedFields = [];

    const addField = (col, val, label = col) => {
      updates.push(`${col} = $${pIdx++}`);
      params.push(val);
      const previous = before[col];
      const nextText = val === null || val === undefined ? '' : String(val);
      const prevText = previous === null || previous === undefined ? '' : String(previous);
      if (prevText !== nextText) changedFields.push(label);
    };

    if (first_name !== undefined)            addField('first_name', first_name, 'first name');
    if (middle_name !== undefined)           addField('middle_name', middle_name ? String(middle_name).trim() : null, 'middle name');
    if (last_name !== undefined)             addField('last_name', last_name, 'last name');
    if (mothers_maiden_name !== undefined) {
      const maidenName = cleanPart(mothers_maiden_name);
      if (!maidenName) {
        return res.status(400).json({ success: false, message: "Mother's maiden name is required." });
      }
      addField('mothers_maiden_name', maidenName, "mother's maiden name");
    }
    if (civil_status !== undefined) {
      const civilStatus = cleanPart(civil_status);
      if (!civilStatus || !CIVIL_STATUSES.has(civilStatus)) {
        return res.status(400).json({ success: false, message: 'A valid civil status is required.' });
      }
      addField('civil_status', civilStatus, 'civil status');
    }
    if (address_region !== undefined)        addField('address_region', cleanPart(address_region), 'region');
    if (address_province !== undefined)      addField('address_province', cleanPart(address_province), 'province');
    if (address_city !== undefined)          addField('address_city', cleanPart(address_city), 'city');
    if (address_barangay !== undefined)      addField('address_barangay', cleanPart(address_barangay), 'barangay');
    if (address_street !== undefined)        addField('address_street', cleanPart(address_street), 'street');
    if (address_zip !== undefined)           addField('address_zip', cleanPart(address_zip), 'ZIP');

    const nextAddressParts = {
      address_region: address_region !== undefined ? cleanPart(address_region) : before.address_region,
      address_province: address_province !== undefined ? cleanPart(address_province) : before.address_province,
      address_city: address_city !== undefined ? cleanPart(address_city) : before.address_city,
      address_barangay: address_barangay !== undefined ? cleanPart(address_barangay) : before.address_barangay,
      address_street: address_street !== undefined ? cleanPart(address_street) : before.address_street,
      address_zip: address_zip !== undefined ? cleanPart(address_zip) : before.address_zip,
    };
    const composedFromParts = composeAddress(nextAddressParts);
    if (composedFromParts) {
      addField('address', composedFromParts, 'address');
    } else if (address !== undefined) {
      addField('address', address, 'address');
    }

    if (latitude !== undefined)              addField('latitude', parseOptionalCoord(latitude), 'latitude');
    if (longitude !== undefined)             addField('longitude', parseOptionalCoord(longitude), 'longitude');
    if (contact_phone !== undefined)         addField('contact_phone', contact_phone, 'phone');
    if (contact_person_fname !== undefined)  addField('contact_person_fname', contact_person_fname, 'primary contact');
    if (contact_person_mname !== undefined)  addField('contact_person_mname', contact_person_mname ? String(contact_person_mname).trim() : null, 'primary contact');
    if (contact_person_lname !== undefined)  addField('contact_person_lname', contact_person_lname, 'primary contact');
    if (contact_person_phone !== undefined)  addField('contact_person_phone', contact_person_phone, 'primary contact phone');
    if (contact_person_relationship !== undefined) {
      addField('contact_person_relationship', contact_person_relationship ? String(contact_person_relationship).trim() : null, 'primary relationship');
    }
    if (secondary_contact_fname !== undefined) addField('secondary_contact_fname', secondary_contact_fname, 'secondary contact');
    if (secondary_contact_lname !== undefined) addField('secondary_contact_lname', secondary_contact_lname, 'secondary contact');
    if (secondary_contact_phone !== undefined) addField('secondary_contact_phone', secondary_contact_phone, 'secondary contact phone');
    if (secondary_contact_relationship !== undefined) {
      addField('secondary_contact_relationship', secondary_contact_relationship ? String(secondary_contact_relationship).trim() : null, 'secondary relationship');
    }
    if (!isSalesAgent && branch_id !== undefined) {
      addField('branch_id', branch_id ? Number(branch_id) : null, 'branch');
    }
    if (territory_id !== undefined) {
      const nextTerritoryId = territory_id ? Number(territory_id) : null;
      if (!nextTerritoryId && String(before.status || 'Active') === 'Active') {
        return res.status(400).json({
          success: false,
          message: 'Active customers require an Active territory in the same branch.',
        });
      }
      if (nextTerritoryId) {
        const territoryCheck = await req.app.locals.pool.query(
          `SELECT territory_id, branch_id, COALESCE(status, 'Active') AS status
           FROM territories WHERE territory_id = $1`,
          [nextTerritoryId]
        );
        if (!territoryCheck.rows.length) {
          return res.status(400).json({ success: false, message: 'Territory not found.' });
        }
        const customerBranchId = branch_id !== undefined && !isSalesAgent
          ? Number(branch_id)
          : Number(before.branch_id);
        if (Number(territoryCheck.rows[0].branch_id) !== Number(customerBranchId)) {
          return res.status(400).json({
            success: false,
            message: 'Territory belongs to a different branch than the customer.',
          });
        }
        if (territoryCheck.rows[0].status !== 'Active' && String(before.status || 'Active') === 'Active') {
          return res.status(400).json({
            success: false,
            message: 'Active customers can only be assigned to Active territories.',
          });
        }
      }
      addField('territory_id', nextTerritoryId, 'territory');
    }
    if (!isSalesAgent && account_manager_id !== undefined) {
      addField('account_manager_id', account_manager_id ? Number(account_manager_id) : null, 'account manager');
    }
    if (!isSalesAgent && status !== undefined) {
      addField('status', status, 'account status');
    }

    const mergedFirst = first_name !== undefined ? first_name : before.first_name;
    const mergedMiddle = middle_name !== undefined ? middle_name : before.middle_name;
    const mergedLast = last_name !== undefined ? last_name : before.last_name;
    const mergedPhone = contact_phone !== undefined ? contact_phone : before.contact_phone;
    const mergedContactFirst = contact_person_fname !== undefined ? contact_person_fname : before.contact_person_fname;
    const mergedContactMiddle = contact_person_mname !== undefined ? contact_person_mname : before.contact_person_mname;
    const mergedContactLast = contact_person_lname !== undefined ? contact_person_lname : before.contact_person_lname;
    const mergedContactPhone = contact_person_phone !== undefined ? contact_person_phone : before.contact_person_phone;
    const customerFullName = [mergedFirst, mergedMiddle, mergedLast].filter(Boolean).join(' ');
    const contactFullName = [mergedContactFirst, mergedContactMiddle, mergedContactLast].filter(Boolean).join(' ');
    if (namesMatchCustomer(customerFullName, contactFullName) || phonesMatch(mergedPhone, mergedContactPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Primary contact must be someone else to call when the customer is unreachable.',
      });
    }

    if (id_type !== undefined) {
      const nextType = id_type ? String(id_type).trim() : null;
      if (nextType && !GOVERNMENT_ID_TYPES.has(nextType)) {
        return res.status(400).json({ success: false, message: 'Invalid government ID type.' });
      }
      addField('id_type', nextType, 'ID type');
    }
    if (id_number !== undefined) {
      addField('id_number', id_number ? String(id_number).trim() : null, 'ID number');
    }
    if (id_photo !== undefined) {
      try {
        addField('id_photo', normalizeIdPhoto(id_photo), 'ID photo');
      } catch (photoError) {
        return res.status(400).json({ success: false, message: photoError.message });
      }
    }
    if (id_verification_status !== undefined) {
      if (isSalesAgent) {
        return res.status(403).json({
          success: false,
          message: 'Sales agents cannot change ID verification status.',
        });
      }
      const nextStatus = String(id_verification_status || '').trim();
      if (!ID_VERIFICATION_STATUSES.has(nextStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid ID verification status.' });
      }
      addField('id_verification_status', nextStatus, 'ID verification');
    }

    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    params.push(customerId);
    const result = await pool.query(
      `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE customer_id = $${pIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Customer not found.' });

    const after = result.rows[0];
    const actorName = salesAgentDisplayName(req.currentUser);
    const uniqueChanges = [...new Set(changedFields)];
    if (uniqueChanges.length) {
      const code = after.customer_code || `C-${customerId}`;
      await writeCustomerAudit(pool, {
        userId: req.currentUser?.id,
        userName: actorName,
        action: 'Customer profile updated',
        statusDetails: `${code}: ${uniqueChanges.join(', ')}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      });
      await notifyCustomerProfileUpdated(pool, {
        branchId: after.branch_id,
        customerId,
        customerCode: after.customer_code,
        customerName: `${after.first_name || ''} ${after.last_name || ''}`.trim(),
        actorName,
        changedFields: uniqueChanges,
      });
    }

    await writeAuditFromReq(pool, req, {
      module: 'Customer Management',
      activity: 'Update Customer',
      action: 'Update Customer',
      description: `Updated customer ${after.first_name || ''} ${after.last_name || ''}`.trim(),
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `customer:${after.customer_id}`,
    });

    return res.status(200).json({ success: true, message: 'Customer updated.', data: after });
  } catch (err) {
    console.error('[Customers] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update customer.' });
  }
});

export default router;
