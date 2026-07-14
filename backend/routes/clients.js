import express from 'express';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/clients
// Query params: branch_id, status, risk_level, search, page, limit
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { branch_id, status, risk_level, search, page = 1, limit = 20 } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (branch_id)  { conditions.push(`c.branch_id = $${pIdx++}`);    params.push(Number(branch_id)); }
    if (status)     { conditions.push(`c.status = $${pIdx++}`);       params.push(status); }
    if (risk_level) { conditions.push(`c.risk_level = $${pIdx++}`);   params.push(risk_level); }
    if (search) {
      conditions.push(`(c.client_name ILIKE $${pIdx} OR c.account_number ILIKE $${pIdx} OR c.contact_person ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM clients c ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT
         c.*,
         b.name AS branch_name,
         u.full_name AS assigned_collector_name
       FROM clients c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users u ON u.id = c.assigned_collector
       ${where}
       ORDER BY c.days_overdue DESC, c.outstanding_balance DESC
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
    console.error('[Clients] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch clients.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/clients/:id  — Client detail with payment history
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const clientResult = await pool.query(
      `SELECT c.*, b.name AS branch_name, u.full_name AS assigned_collector_name
       FROM clients c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users u ON u.id = c.assigned_collector
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found.' });
    }

    const paymentsResult = await pool.query(
      `SELECT cp.*, u.full_name AS collector_name
       FROM collection_payments cp
       LEFT JOIN users u ON u.id = cp.collector_id
       WHERE cp.client_id = $1
       ORDER BY cp.payment_date DESC
       LIMIT 30`,
      [req.params.id]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...clientResult.rows[0],
        paymentHistory: paymentsResult.rows,
      },
    });
  } catch (err) {
    console.error('[Clients] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch client.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/clients  — Create client
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      account_number, client_name, business_name, business_type,
      contact_person, phone, email, address, branch_id,
      credit_limit, assigned_collector, account_open_date,
    } = req.body;

    if (!account_number || !client_name) {
      return res.status(400).json({ success: false, message: 'account_number and client_name are required.' });
    }

    const result = await pool.query(
      `INSERT INTO clients
         (account_number, client_name, business_name, business_type, contact_person,
          phone, email, address, branch_id, credit_limit, assigned_collector, account_open_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        account_number.trim().toUpperCase(),
        client_name.trim(),
        business_name || null, business_type || null, contact_person || null,
        phone || null, email || null, address || null,
        branch_id ? Number(branch_id) : null,
        Number(credit_limit) || 0,
        assigned_collector ? Number(assigned_collector) : null,
        account_open_date || null,
      ]
    );

    return res.status(201).json({ success: true, message: 'Client created.', data: result.rows[0] });
  } catch (err) {
    console.error('[Clients] POST / error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Account number already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to create client.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/clients/:id
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      client_name, business_name, business_type, contact_person,
      phone, email, address, branch_id, credit_limit,
      outstanding_balance, status, days_overdue, risk_level,
      blacklisted, assigned_collector,
    } = req.body;

    const updates = [];
    const params = [];
    let pIdx = 1;

    const addField = (col, val) => { updates.push(`${col} = $${pIdx++}`); params.push(val); };

    if (client_name !== undefined)       addField('client_name', client_name);
    if (business_name !== undefined)     addField('business_name', business_name);
    if (business_type !== undefined)     addField('business_type', business_type);
    if (contact_person !== undefined)    addField('contact_person', contact_person);
    if (phone !== undefined)             addField('phone', phone);
    if (email !== undefined)             addField('email', email);
    if (address !== undefined)           addField('address', address);
    if (branch_id !== undefined)         addField('branch_id', branch_id ? Number(branch_id) : null);
    if (credit_limit !== undefined)      addField('credit_limit', Number(credit_limit));
    if (outstanding_balance !== undefined) addField('outstanding_balance', Number(outstanding_balance));
    if (status !== undefined)            addField('status', status);
    if (days_overdue !== undefined)      addField('days_overdue', Number(days_overdue));
    if (risk_level !== undefined)        addField('risk_level', risk_level);
    if (blacklisted !== undefined)       addField('blacklisted', Boolean(blacklisted));
    if (assigned_collector !== undefined) addField('assigned_collector', assigned_collector ? Number(assigned_collector) : null);

    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    params.push(Number(req.params.id));
    const result = await pool.query(
      `UPDATE clients SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Client not found.' });
    return res.status(200).json({ success: true, message: 'Client updated.', data: result.rows[0] });
  } catch (err) {
    console.error('[Clients] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update client.' });
  }
});

export default router;
