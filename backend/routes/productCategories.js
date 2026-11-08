import express from 'express';
import { allow, ROLE_SETS } from '../middleware/auth.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';

const router = express.Router();
router.use(allow(ROLE_SETS.categoriesRead, ROLE_SETS.categoriesWrite));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/product-categories — List all product categories
// Accessible to all authenticated users
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { search, status } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (status) {
      conditions.push(`pc.status = $${pIdx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`pc.category_name ILIKE $${pIdx++}`);
      params.push(`%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         pc.category_id,
         pc.category_name,
         pc.status,
         pc.created_at,
         pc.updated_at,
         COALESCE(pcnt.product_count, 0)::int AS product_count
       FROM product_categories pc
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS product_count
         FROM products p
         WHERE p.category_id = pc.category_id
           AND COALESCE(p.status, 'Active') = 'Active'
       ) pcnt ON TRUE
       ${where}
       ORDER BY
         CASE WHEN COALESCE(pc.status, 'Active') = 'Active' THEN 0 ELSE 1 END,
         pc.category_name ASC`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[ProductCategories] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch product categories.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/product-categories/:id — Get single category
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const catId = Number(req.params.id);

    const result = await pool.query(
      `SELECT category_id, category_name, status, created_at, updated_at FROM product_categories WHERE category_id = $1`,
      [catId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product category not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[ProductCategories] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch product category.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/product-categories — Create category
// Restricted to super_admin and operating_manager
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { category_name } = req.body;

    if (!category_name || !category_name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    // Check for duplicate
    const dup = await pool.query(
      `SELECT category_id FROM product_categories WHERE category_name ILIKE $1`,
      [category_name.trim()]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A category with this name already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO product_categories (category_name, status) VALUES ($1, 'Active') RETURNING *`,
      [category_name.trim()]
    );

    await writeAuditFromReq(pool, req, {
      module: 'Product Categories',
      activity: 'Create Category',
      action: 'Create Category',
      description: `Created product category ${category_name.trim()}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `category:${result.rows[0].category_id}`,
    });

    return res.status(201).json({ success: true, message: 'Product category created.', data: result.rows[0] });
  } catch (err) {
    console.error('[ProductCategories] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create product category.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/product-categories/:id — Update category
// Restricted to super_admin and operating_manager
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const catId = Number(req.params.id);
    const { category_name, status } = req.body;

    const check = await pool.query(`SELECT category_id FROM product_categories WHERE category_id = $1`, [catId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product category not found.' });
    }

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (category_name !== undefined) {
      updates.push(`category_name = $${pIdx++}`);
      params.push(category_name.trim());
    }
    if (status !== undefined) {
      updates.push(`status = $${pIdx++}`);
      params.push(status);
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    params.push(catId);
    const result = await pool.query(
      `UPDATE product_categories SET ${updates.join(', ')} WHERE category_id = $${pIdx} RETURNING *`,
      params
    );

    await writeAuditFromReq(pool, req, {
      module: 'Product Categories',
      activity: 'Edit Category',
      action: 'Edit Category',
      description: `Edited product category #${catId}${category_name ? ` to ${String(category_name).trim()}` : ''}.`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `category:${catId}`,
    });

    return res.status(200).json({ success: true, message: 'Product category updated.', data: result.rows[0] });
  } catch (err) {
    console.error('[ProductCategories] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update product category.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/product-categories/:id — Archive category (set status to Inactive)
// Restricted to super_admin and operating_manager
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const catId = Number(req.params.id);

    const check = await pool.query(
      `SELECT category_id, status FROM product_categories WHERE category_id = $1`,
      [catId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product category not found.' });
    }
    if (String(check.rows[0].status || '').toLowerCase() === 'inactive') {
      return res.status(400).json({ success: false, message: 'Category is already archived.' });
    }

    const linked = await pool.query(
      `SELECT COUNT(*)::int AS c FROM products WHERE category_id = $1`,
      [catId]
    );
    const productCount = Number(linked.rows[0]?.c) || 0;

    // Archive instead of hard delete. Products keep their category assignment.
    await pool.query(
      `UPDATE product_categories SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE category_id = $1`,
      [catId]
    );

    await writeAuditFromReq(pool, req, {
      module: 'Product Categories',
      activity: 'Archive Category',
      action: 'Archive Category',
      description: `Archived product category #${catId}.`,
      status: AUDIT_STATUS.ARCHIVED,
      affectedRecord: `category:${catId}`,
    });

    return res.status(200).json({
      success: true,
      message: productCount > 0
        ? `Category archived. ${productCount} product(s) remain filed under it; it will no longer appear in Active category pickers.`
        : 'Product category archived successfully.',
      data: { product_count: productCount },
    });
  } catch (err) {
    console.error('[ProductCategories] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to archive product category.' });
  }
});

export default router;
