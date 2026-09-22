import express from 'express';
import { allow, assertSameBranch, ROLE_SETS } from '../middleware/auth.js';

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
         c.territory_id,
         t.territory_name,
         c.first_name,
         c.last_name,
         c.address,
         c.latitude,
         c.longitude,
         c.contact_phone,
         c.contact_person_fname,
         c.contact_person_lname,
         c.contact_person_phone,
         c.contact_person_relationship,
         c.secondary_contact_fname,
         c.secondary_contact_lname,
         c.secondary_contact_phone,
         c.secondary_contact_relationship,
         c.status,
         c.created_at,
         c.updated_at,
         b.name AS branch_name,
         mgr.full_name AS account_manager_name,
         ${PURCHASE_VOLUME_UNITS_SQL} AS "purchaseVolumeUnits"`;

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    let { branch_id, status, search, page = 1, limit = 20 } = req.query;

    if (!branch_id && req.currentUser && req.currentUser.branchId) {
      branch_id = String(req.currentUser.branchId);
    }

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (branch_id) { conditions.push(`c.branch_id = $${pIdx++}`); params.push(Number(branch_id)); }
    if (status)    { conditions.push(`c.status = $${pIdx++}`);    params.push(status); }
    if (search) {
      conditions.push(`(c.first_name ILIKE $${pIdx} OR c.last_name ILIKE $${pIdx} OR c.address ILIKE $${pIdx} OR c.contact_phone ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx += 1;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM customers c ${where}`,
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

router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const customerResult = await pool.query(
      `SELECT
         ${CUSTOMER_SELECT_CORE}
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
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

    return res.status(200).json({
      success: true,
      data: {
        ...customerResult.rows[0],
        activity: activityResult.rows[0] || null,
        creditInfo: creditResult.rows[0] || null,
        paymentHistory: paymentsResult.rows,
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
    first_name, last_name, address, latitude, longitude,
    contact_phone, contact_person_fname, contact_person_lname,
    contact_person_phone, contact_person_relationship,
    secondary_contact_fname, secondary_contact_lname,
    secondary_contact_phone, secondary_contact_relationship,
    branch_id, territory_id, account_manager_id, status,
  } = req.body;

  const resolvedBranchId = branch_id
    ? Number(branch_id)
    : (req.currentUser?.branchId ?? null);

  if (!first_name || !last_name || !address || !contact_phone
    || !contact_person_fname || !contact_person_lname || !contact_person_phone) {
    return res.status(400).json({ success: false, message: 'All required customer fields must be provided.' });
  }

  if (!resolvedBranchId) {
    return res.status(400).json({ success: false, message: 'branch_id is required to create a customer.' });
  }

  const client = await req.app.locals.pool.connect();

  try {

    const lat = latitude !== undefined && latitude !== null && latitude !== ''
      ? Number(latitude)
      : 7.1907;
    const lng = longitude !== undefined && longitude !== null && longitude !== ''
      ? Number(longitude)
      : 125.4553;

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO customers
        (branch_id, account_manager_id, territory_id,
         first_name, last_name, address, latitude, longitude,
         contact_phone, contact_person_fname, contact_person_lname, contact_person_phone,
         contact_person_relationship,
         secondary_contact_fname, secondary_contact_lname, secondary_contact_phone,
         secondary_contact_relationship, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING customer_id, created_at`,
      [
        resolvedBranchId,
        account_manager_id ? Number(account_manager_id) : (req.currentUser?.id ?? null),
        territory_id ? Number(territory_id) : null,
        first_name.trim(),
        last_name.trim(),
        address.trim(),
        lat,
        lng,
        contact_phone.trim(),
        contact_person_fname.trim(),
        contact_person_lname.trim(),
        contact_person_phone.trim(),
        contact_person_relationship?.trim() || null,
        secondary_contact_fname?.trim() || null,
        secondary_contact_lname?.trim() || null,
        secondary_contact_phone?.trim() || null,
        secondary_contact_relationship?.trim() || null,
        status || 'Active',
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

    await client.query('COMMIT');

    const detail = await req.app.locals.pool.query(
      `SELECT ${CUSTOMER_SELECT_CORE}
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       WHERE c.customer_id = $1`,
      [customerId]
    );

    return res.status(201).json({
      success: true,
      message: 'Customer created.',
      data: detail.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Customers] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create customer.' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const existing = await pool.query(`SELECT branch_id FROM customers WHERE customer_id = $1`, [Number(req.params.id)]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    if (!assertSameBranch(res, req.currentUser, existing.rows[0].branch_id)) return;
    const {
      first_name, last_name, address, latitude, longitude,
      contact_phone, contact_person_fname, contact_person_lname,
      contact_person_phone, contact_person_relationship,
      secondary_contact_fname, secondary_contact_lname,
      secondary_contact_phone, secondary_contact_relationship,
      branch_id, territory_id, account_manager_id, status,
    } = req.body;

    const updates = [];
    const params = [];
    let pIdx = 1;

    const addField = (col, val) => { updates.push(`${col} = $${pIdx++}`); params.push(val); };

    if (first_name !== undefined)            addField('first_name', first_name);
    if (last_name !== undefined)             addField('last_name', last_name);
    if (address !== undefined)               addField('address', address);
    if (latitude !== undefined)              addField('latitude', latitude ? Number(latitude) : null);
    if (longitude !== undefined)             addField('longitude', longitude ? Number(longitude) : null);
    if (contact_phone !== undefined)         addField('contact_phone', contact_phone);
    if (contact_person_fname !== undefined)  addField('contact_person_fname', contact_person_fname);
    if (contact_person_lname !== undefined)  addField('contact_person_lname', contact_person_lname);
    if (contact_person_phone !== undefined)  addField('contact_person_phone', contact_person_phone);
    if (contact_person_relationship !== undefined) addField('contact_person_relationship', contact_person_relationship);
    if (secondary_contact_fname !== undefined) addField('secondary_contact_fname', secondary_contact_fname);
    if (secondary_contact_lname !== undefined) addField('secondary_contact_lname', secondary_contact_lname);
    if (secondary_contact_phone !== undefined) addField('secondary_contact_phone', secondary_contact_phone);
    if (secondary_contact_relationship !== undefined) addField('secondary_contact_relationship', secondary_contact_relationship);
    if (branch_id !== undefined)             addField('branch_id', branch_id ? Number(branch_id) : null);
    if (territory_id !== undefined)          addField('territory_id', territory_id ? Number(territory_id) : null);
    if (account_manager_id !== undefined)    addField('account_manager_id', account_manager_id ? Number(account_manager_id) : null);
    if (status !== undefined)                addField('status', status);

    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    params.push(Number(req.params.id));
    const result = await pool.query(
      `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE customer_id = $${pIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Customer not found.' });
    return res.status(200).json({ success: true, message: 'Customer updated.', data: result.rows[0] });
  } catch (err) {
    console.error('[Customers] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update customer.' });
  }
});

export default router;
