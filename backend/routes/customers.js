import express from 'express';
import { allow, assertSameBranch, ROLE_SETS } from '../middleware/auth.js';
import {
  createPortalInvitation,
  resendPortalInvitation,
  dispatchPortalActivationEmail,
} from '../lib/customerPortal.js';
import { isMailConfigured } from '../lib/mail.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';
import { notifyCustomerProfileUpdated, writeCustomerAudit } from '../lib/customerNotifications.js';

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

function wantsPortalAccount(flag) {
  return flag === true || flag === 'true';
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
         c.branch_id,
         c.account_manager_id,
         c.assigned_sales_agent_id,
         c.territory_id,
         t.territory_name,
         c.first_name,
         c.middle_name,
         c.last_name,
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
         c.created_at,
         c.updated_at,
         b.name AS branch_name,
         mgr.full_name AS account_manager_name,
         agent.full_name AS assigned_sales_agent_name,
         ${PURCHASE_VOLUME_UNITS_SQL} AS "purchaseVolumeUnits"`;

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    let { branch_id, status, search, standing, page = 1, limit = 20 } = req.query;

    if (!branch_id && req.currentUser && req.currentUser.branchId) {
      branch_id = String(req.currentUser.branchId);
    }

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (branch_id) { conditions.push(`c.branch_id = $${pIdx++}`); params.push(Number(branch_id)); }
    if (status)    { conditions.push(`c.status = $${pIdx++}`);    params.push(status); }
    if (search) {
      conditions.push(`(
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
      )`);
      params.push(`%${search}%`);
      pIdx += 1;
    }

    const standingKey = String(standing || '').trim().toLowerCase();
    if (standingKey === 'with_balance') {
      conditions.push(`COALESCE((
        SELECT outstanding_balance FROM customer_activity WHERE customer_id = c.customer_id
      ), 0) > 0`);
    } else if (standingKey === 'overdue') {
      conditions.push(`EXISTS (
        SELECT 1
        FROM sales_invoices si
        WHERE si.customer_id = c.customer_id
          AND si.status IN ('Pending Review', 'Confirmed')
          AND si.due_date IS NOT NULL
          AND si.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
      )`);
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

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM customers c
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       LEFT JOIN branches b ON b.id = c.branch_id
       ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    let activityColumns = '';
    try {
      const tableCheck = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_activity')`);
      if (tableCheck.rows[0]?.exists) {
        activityColumns = `
          COALESCE((SELECT outstanding_balance FROM customer_activity WHERE customer_id = c.customer_id), 0) AS "outstandingBalance",
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
          EXISTS (
            SELECT 1
            FROM sales_invoices si
            WHERE si.customer_id = c.customer_id
              AND si.status IN ('Pending Review', 'Confirmed')
              AND si.due_date IS NOT NULL
              AND si.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
          ) AS "hasOverdueInvoice",
          CASE
            WHEN COALESCE((SELECT outstanding_balance FROM customer_activity WHERE customer_id = c.customer_id), 0) <= 0
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

    const result = await pool.query(
      `SELECT
         ${CUSTOMER_SELECT_CORE},
         ${activityColumns}
         COALESCE(c.contact_phone, '') AS phone
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       ${where}
       ORDER BY c.customer_id DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, Number(limit), offset]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error('[Customers] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch customers.' });
  }
});

router.get('/lookup', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const phone = String(req.query.contact_phone || '').trim();
    const email = String(req.query.portal_email || '').trim().toLowerCase();
    if (!phone && !email) {
      return res.status(400).json({ success: false, message: 'Provide contact_phone or portal_email to search.' });
    }

    const matches = [];
    if (phone) {
      const byPhone = await pool.query(
        `SELECT customer_id, customer_code, first_name, last_name, contact_phone, portal_email, portal_status
         FROM customers
         WHERE contact_phone = $1 OR contact_person_phone = $1
         LIMIT 5`,
        [phone]
      );
      matches.push(...byPhone.rows);
    }
    if (email) {
      const byEmail = await pool.query(
        `SELECT customer_id, customer_code, first_name, last_name, contact_phone, portal_email, portal_status
         FROM customers
         WHERE LOWER(portal_email) = $1
         LIMIT 5`,
        [email]
      );
      matches.push(...byEmail.rows);
    }

    const unique = [...new Map(matches.map((row) => [row.customer_id, row])).values()];
    return res.status(200).json({ success: true, data: unique, count: unique.length });
  } catch (err) {
    console.error('[Customers] GET /lookup error:', err.message);
    return res.status(500).json({ success: false, message: 'Lookup failed.' });
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
           WHERE si.customer_id = $1
             AND si.status IN ('Pending Review', 'Confirmed')`,
          [req.params.id]
        ),
        pool.query(
          `SELECT EXISTS (
             SELECT 1
             FROM sales_invoices si
             WHERE si.customer_id = $1
               AND si.status IN ('Pending Review', 'Confirmed')
               AND si.due_date IS NOT NULL
               AND si.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
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

    return res.status(200).json({
      success: true,
      data: {
        ...customerResult.rows[0],
        activity: activityResult.rows[0] || null,
        creditInfo: creditResult.rows[0] || null,
        paymentHistory: paymentsResult.rows,
        recentSales,
        unpaidInvoiceCount,
        hasOverdueInvoice,
        earliestDueDate,
        lastFieldVisitDate,
        todayVisit,
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
    first_name, middle_name, last_name, mothers_maiden_name, civil_status,
    address, latitude, longitude,
    address_region, address_province, address_city, address_barangay, address_street, address_zip,
    contact_phone, contact_person_fname, contact_person_mname, contact_person_lname,
    contact_person_phone, contact_person_relationship,
    secondary_contact_fname, secondary_contact_lname,
    secondary_contact_phone, secondary_contact_relationship,
    branch_id, territory_id, account_manager_id, status,
    create_portal_account, portal_email,
    id_type, id_number, id_photo,
  } = req.body;

  const resolvedBranchId = branch_id
    ? Number(branch_id)
    : (req.currentUser?.branchId ?? null);
  const isSalesAgent = req.currentUser?.roleSlug === 'sales_staff';

  const addressParts = {
    address_region: cleanPart(address_region),
    address_province: cleanPart(address_province),
    address_city: cleanPart(address_city),
    address_barangay: cleanPart(address_barangay),
    address_street: cleanPart(address_street),
    address_zip: cleanPart(address_zip),
  };
  const composedAddress = composeAddress(addressParts) || cleanPart(address);

  const maidenName = cleanPart(mothers_maiden_name);
  const civilStatus = cleanPart(civil_status);

  if (!first_name || !last_name || !composedAddress || !contact_phone
    || !contact_person_fname || !contact_person_lname || !contact_person_phone
    || !contact_person_relationship || !maidenName || !civilStatus) {
    return res.status(400).json({ success: false, message: 'All required customer fields must be provided.' });
  }
  if (!CIVIL_STATUSES.has(civilStatus)) {
    return res.status(400).json({ success: false, message: 'A valid civil status is required.' });
  }
  if (!addressParts.address_province || !addressParts.address_city || !addressParts.address_barangay) {
    return res.status(400).json({
      success: false,
      message: 'Province, city/municipality, and barangay are required.',
    });
  }

  const customerFullName = [first_name, middle_name, last_name].filter(Boolean).join(' ');
  const contactFullName = [contact_person_fname, contact_person_mname, contact_person_lname].filter(Boolean).join(' ');
  if (namesMatchCustomer(customerFullName, contactFullName) || phonesMatch(contact_phone, contact_person_phone)) {
    return res.status(400).json({
      success: false,
      message: 'Primary contact must be someone else to call when the customer is unreachable.',
    });
  }

  const idType = typeof id_type === 'string' ? id_type.trim() : '';
  const idNumber = typeof id_number === 'string' ? id_number.trim() : '';
  if (!idType || !GOVERNMENT_ID_TYPES.has(idType)) {
    return res.status(400).json({ success: false, message: 'A valid government ID type is required.' });
  }
  if (!idNumber) {
    return res.status(400).json({ success: false, message: 'Government ID number is required.' });
  }

  if (!resolvedBranchId) {
    return res.status(400).json({ success: false, message: 'branch_id is required to create a customer.' });
  }

  // SA canvassing registration does not create portal accounts from this screen.
  const portalRequested = !isSalesAgent && wantsPortalAccount(create_portal_account);
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

    const assignedSalesAgentId = isSalesAgent
      ? req.currentUser.id
      : null;

    const result = await client.query(
      `INSERT INTO customers
        (branch_id, account_manager_id, assigned_sales_agent_id, territory_id,
         first_name, middle_name, last_name, mothers_maiden_name, civil_status, address,
         address_region, address_province, address_city, address_barangay, address_street, address_zip,
         latitude, longitude,
         contact_phone, contact_person_fname, contact_person_mname, contact_person_lname, contact_person_phone,
         contact_person_relationship,
         secondary_contact_fname, secondary_contact_lname, secondary_contact_phone,
         secondary_contact_relationship, status,
         id_type, id_number, id_photo, id_verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,'Unverified')
       RETURNING customer_id, created_at`,
      [
        resolvedBranchId,
        account_manager_id ? Number(account_manager_id) : (req.currentUser?.id ?? null),
        assignedSalesAgentId,
        territory_id ? Number(territory_id) : null,
        first_name.trim(),
        middle_name ? String(middle_name).trim() : null,
        last_name.trim(),
        maidenName,
        civilStatus,
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
        contact_person_fname.trim(),
        contact_person_mname ? String(contact_person_mname).trim() : null,
        contact_person_lname.trim(),
        contact_person_phone.trim(),
        String(contact_person_relationship).trim(),
        secondary_contact_fname?.trim() || null,
        secondary_contact_lname?.trim() || null,
        secondary_contact_phone?.trim() || null,
        secondary_contact_relationship?.trim() || null,
        isSalesAgent ? 'Active' : (status || 'Active'),
        idType,
        idNumber,
        idPhotoValue,
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

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Customer Management',
      activity: 'Create Customer',
      action: 'Create Customer',
      description: `Created customer ${first_name} ${last_name}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `customer:${customerId}`,
    });

    return res.status(201).json({
      success: true,
      message: createMessage,
      data: detail.rows[0],
      portal: portalPayload,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Customers] POST / error:', err.message);
    const clientMessage = err.message || 'Failed to create customer.';
    const status = /email|portal|valid/i.test(clientMessage) ? 400 : 500;
    return res.status(status).json({ success: false, message: clientMessage });
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
    if (!isSalesAgent && territory_id !== undefined) {
      addField('territory_id', territory_id ? Number(territory_id) : null, 'territory');
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
