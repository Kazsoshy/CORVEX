import express from 'express';

const router = express.Router();

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
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      pIdx += 4;
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
          COALESCE((SELECT purchase_volume FROM customer_activity WHERE customer_id = c.customer_id), 0) AS totalPurchaseVolume,
          COALESCE((SELECT outstanding_balance FROM customer_activity WHERE customer_id = c.customer_id), 0) AS outstandingBalance,
          COALESCE(TO_CHAR((SELECT last_sales_visit FROM customer_activity WHERE customer_id = c.customer_id), 'YYYY-MM-DD'), '') AS lastVisitDate,
        `;
      }
    } catch (err) {
      console.error('[Customers] customer_activity check failed:', err.message);
    }

    const result = await pool.query(
      `SELECT
         c.customer_id,
         c.user_id,
         c.branch_id,
         c.first_name,
         c.last_name,
         c.address,
         c.latitude,
         c.longitude,
         c.contact_phone,
         c.contact_person_fname,
         c.contact_person_lname,
         c.contact_person_phone,
         c.status,
         c.created_at,
         c.updated_at,
         ${activityColumns}
         COALESCE(c.contact_phone, '') AS phone
       FROM customers c
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
    return res.status(500).json({ success: false, message: 'Failed to fetch customers.', error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const customerResult = await pool.query(
      `SELECT
         c.customer_id,
         c.user_id,
         c.branch_id,
         c.first_name,
         c.last_name,
         c.address,
         c.latitude,
         c.longitude,
         c.contact_phone,
         c.contact_person_fname,
         c.contact_person_lname,
         c.contact_person_phone,
         c.status,
         c.created_at,
         c.updated_at
       FROM customers c
       WHERE c.customer_id = $1`,
      [req.params.id]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

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
        creditResult = await pool.query(`SELECT * FROM customer_credit_info WHERE customer_id = $1`, [req.params.id]);
      }
    } catch (err) {
      console.error('[Customers] customer_credit_info lookup failed:', err.message);
    }

    try {
      const tableCheck = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_methods')`);
      if (tableCheck.rows[0]?.exists) {
        paymentsResult = await pool.query(
          `SELECT cp.*, 
             pm.method_name AS payment_method
           FROM collection_payment cp
           LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
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
    return res.status(500).json({ success: false, message: 'Failed to fetch customer.', error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      first_name, last_name, address, latitude, longitude,
      contact_phone, contact_person_fname, contact_person_lname,
      contact_person_phone, branch_id, user_id, status,
    } = req.body;

    if (!first_name || !last_name || !address || !contact_phone || !contact_person_fname || !contact_person_lname || !contact_person_phone) {
      return res.status(400).json({ success: false, message: 'All required customer fields must be provided.' });
    }

    const result = await pool.query(
      `INSERT INTO customers
        (user_id, branch_id, first_name, last_name, address, latitude, longitude,
         contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        user_id ? Number(user_id) : null,
        branch_id ? Number(branch_id) : null,
        first_name.trim(),
        last_name.trim(),
        address.trim(),
        latitude ? Number(latitude) : null,
        longitude ? Number(longitude) : null,
        contact_phone.trim(),
        contact_person_fname.trim(),
        contact_person_lname.trim(),
        contact_person_phone.trim(),
        status || 'Active',
      ]
    );

    return res.status(201).json({ success: true, message: 'Customer created.', data: result.rows[0] });
  } catch (err) {
    console.error('[Customers] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create customer.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      first_name, last_name, address, latitude, longitude,
      contact_phone, contact_person_fname, contact_person_lname,
      contact_person_phone, branch_id, user_id, status,
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
    if (branch_id !== undefined)             addField('branch_id', branch_id ? Number(branch_id) : null);
    if (user_id !== undefined)               addField('user_id', user_id ? Number(user_id) : null);
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
