import express from 'express';
import axios from 'axios';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    let { branch_id, status, search, page = 1, limit = 20, user_id } = req.query;

    if (!branch_id && req.currentUser && req.currentUser.branchId) {
      branch_id = String(req.currentUser.branchId);
    }

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (branch_id) { conditions.push(`c.branch_id = $${pIdx++}`); params.push(Number(branch_id)); }
    if (user_id)   { conditions.push(`c.user_id = $${pIdx++}`);   params.push(Number(user_id)); }
    if (status)    { conditions.push(`c.status = $${pIdx++}`);    params.push(status); }
    if (search) {
      conditions.push(`(u.full_name ILIKE $${pIdx} OR u.address ILIKE $${pIdx} OR u.contact_number ILIKE $${pIdx} OR c.contact_person_fname ILIKE $${pIdx})`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      pIdx += 4;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM customers c JOIN users u ON u.id = c.user_id ${where}`,
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
         c.id AS customer_id,
         c.user_id,
         u.branch_id,
         u.full_name AS first_name,
         '' AS last_name,
         u.address,
         c.latitude,
         c.longitude,
         u.contact_number AS contact_phone,
         c.contact_person_fname,
         c.contact_person_lname,
         c.contact_person_phone,
         u.status,
         c.created_at,
         c.updated_at,
         ${activityColumns}
         COALESCE(u.contact_number, '') AS phone
       FROM customers c
       JOIN users u ON u.id = c.user_id
       ${where}
       ORDER BY c.id DESC
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
         c.id AS customer_id,
         c.user_id,
         u.branch_id,
         u.full_name AS first_name,
         '' AS last_name,
         u.address,
         c.latitude,
         c.longitude,
         u.contact_number AS contact_phone,
         c.contact_person_fname,
         c.contact_person_lname,
         c.contact_person_phone,
         u.status,
         c.created_at,
         c.updated_at
       FROM customers c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
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
    let {
      first_name, last_name, address, latitude, longitude,
      contact_phone, contact_person_fname, contact_person_lname,
      contact_person_phone, branch_id, user_id, status,
    } = req.body;

    if (!first_name || !last_name || !address || !contact_phone || !contact_person_fname || !contact_person_lname || !contact_person_phone) {
      return res.status(400).json({ success: false, message: 'All required customer fields must be provided.' });
    }

    // Automatic Geocoding if coordinates are missing
    if (!latitude || !longitude) {
      try {
        const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search`, {
          params: { q: address, format: 'json', limit: 1 }
        });
        if (geoRes.data && geoRes.data.length > 0) {
          latitude = geoRes.data[0].lat;
          longitude = geoRes.data[0].lon;
        }
      } catch (geoErr) {
        console.error('[Customers] Geocoding failed:', geoErr.message);
      }
      
      // Fallback if geocoding fails or returns empty, since DB requires NOT NULL
      if (!latitude || !longitude) {
        latitude = 12.8797; // Default Philippines lat
        longitude = 121.7740; // Default Philippines lng
      }
    }

    const userResult = await pool.query(
      `INSERT INTO users (branch_id, role_id, full_name, username, email, contact_number, address, status)
       VALUES ($1, 7, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        branch_id ? Number(branch_id) : 1,
        (first_name + ' ' + last_name).trim(),
        'cust_' + Date.now(),
        contact_person_phone ? contact_person_phone + '@corvex.ph' : 'noemail@corvex.ph', // Defaulting since email is required
        contact_phone.trim(),
        address.trim(),
        status || 'Active'
      ]
    );
    const newUserId = userResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO customers
        (user_id, latitude, longitude, contact_person_fname, contact_person_lname, contact_person_phone)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id AS customer_id, user_id, latitude, longitude, contact_person_fname, contact_person_lname, contact_person_phone`,
      [
        newUserId,
        latitude ? Number(latitude) : null,
        longitude ? Number(longitude) : null,
        contact_person_fname.trim(),
        contact_person_lname.trim(),
        contact_person_phone.trim()
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

    if (first_name !== undefined || last_name !== undefined || address !== undefined || contact_phone !== undefined || status !== undefined) {
      const userUpdates = [];
      const userParams = [];
      let uIdx = 1;
      const uAddField = (col, val) => { userUpdates.push(`${col} = $${uIdx++}`); userParams.push(val); };
      if (first_name !== undefined || last_name !== undefined) {
         const fn = first_name || ''; const ln = last_name || '';
         uAddField('full_name', (fn + ' ' + ln).trim());
      }
      if (address !== undefined) uAddField('address', address);
      if (contact_phone !== undefined) uAddField('contact_number', contact_phone);
      if (status !== undefined) uAddField('status', status);
      
      if (userUpdates.length > 0) {
        userParams.push(Number(req.params.id)); // Using customer.id to find user
        await pool.query(
          `UPDATE users SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = (SELECT user_id FROM customers WHERE id = $${uIdx})`,
          userParams
        );
      }
    }

    const updates = [];
    const params = [];
    let pIdx = 1;

    const addField = (col, val) => { updates.push(`${col} = $${pIdx++}`); params.push(val); };

    if (latitude !== undefined)              addField('latitude', latitude ? Number(latitude) : null);
    if (longitude !== undefined)             addField('longitude', longitude ? Number(longitude) : null);
    if (contact_person_fname !== undefined)  addField('contact_person_fname', contact_person_fname);
    if (contact_person_lname !== undefined)  addField('contact_person_lname', contact_person_lname);
    if (contact_person_phone !== undefined)  addField('contact_person_phone', contact_person_phone);
    if (user_id !== undefined)               addField('user_id', user_id ? Number(user_id) : null);

    let result = null;
    if (updates.length > 0) {
      params.push(Number(req.params.id));
      result = await pool.query(
        `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx} RETURNING id AS customer_id, *`,
        params
      );
    } else {
      result = await pool.query(`SELECT id AS customer_id, * FROM customers WHERE id = $1`, [Number(req.params.id)]);
    }

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Customer not found.' });
    return res.status(200).json({ success: true, message: 'Customer updated.', data: result.rows[0] });
  } catch (err) {
    console.error('[Customers] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update customer.' });
  }
});

export default router;
