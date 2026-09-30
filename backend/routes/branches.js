import express from 'express';
import { requireAuth, requireRole, requireAssignedBranch, assertSameBranch, isUnscoped, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(requireRole(ROLE_SETS.branches), requireAssignedBranch);

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branches
// Returns all branches with full info: phone, email, region, manager name,
// staff count, customer count, inventory health.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    // Branch managers only see their own branch
    const scopedBranchId = isUnscoped(user) ? null : user.branchId;
    const branchWhere = scopedBranchId ? 'WHERE b.id = $1' : '';
    const params = scopedBranchId ? [scopedBranchId] : [];

    const result = await pool.query(
      `SELECT
         b.id            AS branch_id,
         b.name          AS branch_name,
         b.address,
         b.latitude,
         b.longitude,
         b.phone         AS contact_no,
         b.email,
         b.status,
         b.created_at,
         b.updated_at,
         mgr.id          AS manager_id,
         mgr.full_name   AS manager_name,
         mgr.email       AS manager_email,
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
       GROUP BY b.id, b.name, b.address, b.latitude, b.longitude, b.phone, b.email,
                b.status, b.created_at, b.updated_at,
                mgr.id, mgr.full_name, mgr.email
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
// GET /api/branches/:id  — Single branch with full detail
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const bid = Number(req.params.id);
    if (!assertSameBranch(res, req.currentUser, bid)) return;

    const branchResult = await pool.query(
      `SELECT
         b.id            AS branch_id,
         b.name          AS branch_name,
         b.address,
         b.latitude,
         b.longitude,
         b.phone         AS contact_no,
         b.email,
         b.status,
         b.created_at,
         b.updated_at,
         mgr.id          AS manager_id,
         mgr.full_name   AS manager_name,
         mgr.email       AS manager_email
       FROM branches b
       LEFT JOIN users mgr ON mgr.id = b.manager_id
       WHERE b.id = $1`,
      [bid]
    );

    if (branchResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    const [staffResult, customerResult, inventoryResult, collectionsResult, salesResult] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name, u.email, u.status, r.role_name
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.branch_id = $1 AND u.status = 'Active'
         ORDER BY r.role_name, u.full_name`,
        [bid]
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
         ORDER BY bi.available_stock ASC`,
        [bid]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total,
                COUNT(*) AS count
         FROM collection_payment
         WHERE branch_id = $1 AND payment_date >= (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE '+08'))::DATE`,
        [bid]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
         FROM sales_invoices
         WHERE branch_id = $1 AND invoices_date >= (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE '+08'))::DATE`,
        [bid]
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...branchResult.rows[0],
        staff:       staffResult.rows,
        customers: {
          total:            Number(customerResult.rows[0].total),
          active:           Number(customerResult.rows[0].active),
          totalOutstanding: Number(customerResult.rows[0].total_outstanding),
        },
        inventory:   inventoryResult.rows,
        collections: {
          total: Number(collectionsResult.rows[0].total),
          count: Number(collectionsResult.rows[0].count),
        },
        sales: {
          total: Number(salesResult.rows[0].total),
          count: Number(salesResult.rows[0].count),
        },
      },
    });
  } catch (err) {
    console.error('[Branches] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branch.' });
  }
});

function requireOrgScope(req, res, next) {
  if (!isUnscoped(req.currentUser)) {
    return res.status(403).json({
      success: false,
      message: 'Only organization administrators can modify branches.',
    });
  }
  return next();
}

function normalizeBranchPayload(body, partial = false) {
  const out = {};
  const pick = (key, transform = (v) => v) => {
    if (body[key] !== undefined) out[key] = transform(body[key]);
  };
  pick('branch_name', (v) => String(v || '').trim());
  pick('name', (v) => String(v || '').trim());
  pick('address', (v) => String(v || '').trim());
  pick('latitude', (v) => Number(v));
  pick('longitude', (v) => Number(v));
  pick('phone', (v) => String(v || '').trim());
  pick('contact_no', (v) => String(v || '').trim());
  pick('email', (v) => String(v || '').trim().toLowerCase());
  pick('region', (v) => (v ? String(v).trim() : null));
  pick('status', (v) => String(v || '').trim());
  pick('manager_id', (v) => (v === null || v === '' ? null : Number(v)));
  if (!partial) {
    const name = out.branch_name || out.name;
    if (!name) return { error: 'branch_name is required.' };
    if (!out.address) return { error: 'address is required.' };
    if (!Number.isFinite(out.latitude)) return { error: 'latitude is required.' };
    if (!Number.isFinite(out.longitude)) return { error: 'longitude is required.' };
    const phone = out.phone || out.contact_no;
    if (!phone) return { error: 'phone is required.' };
    if (!out.email) return { error: 'email is required.' };
    out.branch_name = name;
    out.phone = phone;
  }
  return { data: out };
}

// POST /api/branches
router.post('/', requireAuth, requireOrgScope, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const normalized = normalizeBranchPayload(req.body, false);
    if (normalized.error) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const d = normalized.data;
    const status = d.status === 'Inactive' ? 'Inactive' : 'Active';

    const result = await pool.query(
      `INSERT INTO branches (name, address, latitude, longitude, phone, email, region, status, manager_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id AS branch_id, name AS branch_name, address, latitude, longitude,
                 phone AS contact_no, email, region, status, manager_id, created_at, updated_at`,
      [
        d.branch_name,
        d.address,
        d.latitude,
        d.longitude,
        d.phone,
        d.email,
        d.region,
        status,
        d.manager_id ?? null,
      ]
    );

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
    if (d.latitude !== undefined) add('latitude', d.latitude);
    if (d.longitude !== undefined) add('longitude', d.longitude);
    if (d.phone !== undefined || d.contact_no !== undefined) add('phone', d.phone || d.contact_no);
    if (d.email !== undefined) add('email', d.email);
    if (d.region !== undefined) add('region', d.region);
    if (d.status !== undefined) add('status', d.status === 'Inactive' ? 'Inactive' : 'Active');
    if (d.manager_id !== undefined) add('manager_id', d.manager_id);

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(bid);

    const result = await pool.query(
      `UPDATE branches SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id AS branch_id, name AS branch_name, address, latitude, longitude,
                 phone AS contact_no, email, region, status, manager_id, created_at, updated_at`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Branch updated.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Branches] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update branch.' });
  }
});

export default router;
