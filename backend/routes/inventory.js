import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory-transfers
// ──────────────────────────────────────────────────────────────────────────────
router.get('/transfers', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { status } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (user.branchId) {
      conditions.push(`(it.source_branch_id = $${pIdx} OR it.destination_branch_id = $${pIdx})`);
      params.push(user.branchId);
      pIdx++;
    }
    if (status && status !== 'All') {
      conditions.push(`it.status = $${pIdx++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         it.transfer_id, it.transfer_ref, it.quantity, it.status,
         it.submitted_date, it.completed_date, it.approval_info,
         p.name AS product_name, p.sku,
         sb.name AS source_branch,
         db.name AS destination_branch,
         sub.full_name AS submitted_by_name,
         apv.full_name AS approved_by_name
       FROM inventory_transfers it
       JOIN products p ON p.id = it.product_id
       JOIN branches sb ON sb.id = it.source_branch_id
       JOIN branches db ON db.id = it.destination_branch_id
       LEFT JOIN users sub ON sub.id = it.submitted_by
       LEFT JOIN users apv ON apv.id = it.approved_by
       ${where}
       ORDER BY it.created_at DESC`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Inventory] GET /transfers error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch transfers.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory-transfers/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/transfers/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT
         it.transfer_id, it.transfer_ref, it.quantity, it.status,
         it.submitted_date, it.completed_date, it.approval_info, it.created_at, it.updated_at,
         p.name AS product_name, p.sku, p.unit_type,
         sb.name AS source_branch,
         db.name AS destination_branch,
         sub.full_name AS submitted_by_name,
         apv.full_name AS approved_by_name
       FROM inventory_transfers it
       JOIN products p ON p.id = it.product_id
       JOIN branches sb ON sb.id = it.source_branch_id
       JOIN branches db ON db.id = it.destination_branch_id
       LEFT JOIN users sub ON sub.id = it.submitted_by
       LEFT JOIN users apv ON apv.id = it.approved_by
       WHERE it.transfer_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Inventory] GET /transfers/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch transfer.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/restocks
// ──────────────────────────────────────────────────────────────────────────────
router.get('/restocks', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const branchWhere = user.branchId ? `WHERE r.branch_id = ${user.branchId}` : '';

    const result = await pool.query(
      `SELECT
         r.restock_id, r.delivery_ref, r.quantity, r.received_date,
         p.name AS product_name, p.sku,
         b.name AS branch_name,
         s.supplier_name
       FROM restocks r
       JOIN products p ON p.id = r.product_id
       JOIN branches b ON b.id = r.branch_id
       JOIN suppliers s ON s.suppliers_id = r.supplier_id
       ${branchWhere}
       ORDER BY r.received_date DESC`
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Inventory] GET /restocks error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch restocks.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/branch-inventory
// Returns the full branch_inventory table with all schema columns,
// joined with product name and branch name. Branch-scoped for non-OM roles.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/branch-inventory', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    // Branch-scope: non OM/super-admin roles only see their branch
    const branchId = user.branchId !== null
      ? user.branchId
      : (req.query.branch_id ? Number(req.query.branch_id) : null);

    if (branchId !== null && Number.isFinite(Number(branchId))) {
      conditions.push(`bi.branch_id = $${pIdx++}`);
      params.push(Number(branchId));
    }

    if (req.query.status && req.query.status !== 'All') {
      conditions.push(`bi.stock_status = $${pIdx++}`);
      params.push(req.query.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         bi.inventory_id AS branch_inventory_id,
         bi.branch_id,
         b.name   AS branch_name,
         bi.product_id,
         p.name   AS product_name,
         p.sku,
         pc.category_name,
         bi.available_stock,
         bi.reorder_level,
         bi.stock_status,
          bi.last_updated,
          bi.updated_at
       FROM branch_inventory bi
       JOIN branches b          ON b.id               = bi.branch_id
       JOIN products p          ON p.id               = bi.product_id
       LEFT JOIN product_categories pc ON pc.category_id = p.category_id
       ${where}
       ORDER BY b.name, p.name`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('[Inventory] GET /branch-inventory error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branch inventory.' });
  }
});

export default router;
