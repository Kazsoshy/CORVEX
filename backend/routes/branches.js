import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

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
    const branchWhere = user.branchId ? `WHERE b.id = ${user.branchId}` : '';

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
         COALESCE(SUM(DISTINCT bi.available_stock), 0)             AS total_inventory,
         COUNT(DISTINCT bi.inventory_id) FILTER (WHERE bi.available_stock <= bi.reorder_level) AS low_stock_count
       FROM branches b
       LEFT JOIN users mgr ON mgr.id = b.manager_id
       LEFT JOIN users u   ON u.branch_id = b.id
       LEFT JOIN customers c ON c.branch_id = b.id
       LEFT JOIN branch_inventory bi ON bi.branch_id = b.id
       ${branchWhere}
       GROUP BY b.id, b.name, b.address, b.latitude, b.longitude, b.phone, b.email,
                b.status, b.created_at, b.updated_at,
                mgr.id, mgr.full_name, mgr.email
       ORDER BY b.name`
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

export default router;
