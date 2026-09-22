import express from 'express';
import { allow, ROLE_SETS } from '../middleware/auth.js';

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
      conditions.push(`status = $${pIdx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`category_name ILIKE $${pIdx++}`);
      params.push(`%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT category_id, category_name, status, created_at
       FROM product_categories
       ${where}
       ORDER BY category_id`,
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
      `SELECT category_id, category_name, status, created_at FROM product_categories WHERE category_id = $1`,
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

    const check = await pool.query(`SELECT category_id, status FROM product_categories WHERE category_id = $1`, [catId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product category not found.' });
    }

    // Archive instead of hard delete
    await pool.query(
      `UPDATE product_categories SET status = 'Inactive' WHERE category_id = $1`,
      [catId]
    );

    return res.status(200).json({ success: true, message: 'Product category archived successfully.' });
  } catch (err) {
    console.error('[ProductCategories] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to archive product category.' });
  }
});

export default router;
