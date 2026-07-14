import express from 'express';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/products
// Query params: branch_id, category, status, search, page, limit
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { branch_id, category, status, search, page = 1, limit = 50 } = req.query;

    const conditions = ['p.status = \'Active\''];
    const params = [];
    let pIdx = 1;

    if (branch_id) {
      conditions.push(`i.branch_id = $${pIdx++}`);
      params.push(Number(branch_id));
    }
    if (category) {
      conditions.push(`p.category = $${pIdx++}`);
      params.push(category);
    }
    if (status) {
      conditions.push(`i.stock_status = $${pIdx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(p.name ILIKE $${pIdx} OR p.sku ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (Number(page) - 1) * Number(limit);

    // If branch_id provided, join inventory for that branch
    // Otherwise aggregate across all branches
    let query;
    if (branch_id) {
      query = `
        SELECT
          p.id, p.name, p.sku, p.category, p.description,
          p.unit_price, p.unit_type, p.barcode, p.reorder_point,
          p.status, p.created_at, p.updated_at,
          s.name AS supplier_name,
          i.quantity, i.stock_status, i.last_updated,
          b.name AS branch_name
        FROM products p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = $${params.indexOf(Number(branch_id)) + 1}
        LEFT JOIN branches b ON b.id = i.branch_id
        ${where}
        ORDER BY p.name
        LIMIT $${pIdx++} OFFSET $${pIdx++}
      `;
    } else {
      query = `
        SELECT
          p.id, p.name, p.sku, p.category, p.description,
          p.unit_price, p.unit_type, p.barcode, p.reorder_point,
          p.status, p.created_at, p.updated_at,
          s.name AS supplier_name,
          COALESCE(SUM(i.quantity), 0) AS total_quantity,
          CASE
            WHEN COALESCE(SUM(i.quantity), 0) = 0 THEN 'Out of Stock'
            WHEN COALESCE(SUM(i.quantity), 0) <= p.reorder_point * 0.3 THEN 'Critical Stock'
            WHEN COALESCE(SUM(i.quantity), 0) <= p.reorder_point THEN 'Low Stock'
            ELSE 'Sufficient'
          END AS stock_status
        FROM products p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.status = 'Active'
        ${search ? `AND (p.name ILIKE $1 OR p.sku ILIKE $1)` : ''}
        ${category ? `AND p.category = $${search ? 2 : 1}` : ''}
        GROUP BY p.id, s.name
        ORDER BY p.name
        LIMIT $${pIdx - 1} OFFSET $${pIdx}
      `;
    }

    const result = await pool.query(query, [...params, Number(limit), offset]);

    // Get distinct categories
    const cats = await pool.query(`SELECT DISTINCT category FROM products WHERE status='Active' ORDER BY category`);

    return res.status(200).json({
      success: true,
      data: result.rows,
      categories: cats.rows.map(r => r.category),
    });
  } catch (err) {
    console.error('[Products] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/products/:id  — Single product with inventory across all branches
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const productResult = await pool.query(
      `SELECT p.*, s.name AS supplier_name
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const inventoryResult = await pool.query(
      `SELECT i.quantity, i.stock_status, i.last_updated, b.id AS branch_id, b.name AS branch_name
       FROM inventory i
       JOIN branches b ON b.id = i.branch_id
       WHERE i.product_id = $1
       ORDER BY b.name`,
      [req.params.id]
    );

    const movementsResult = await pool.query(
      `SELECT sm.*, u.full_name AS performed_by_name, b.name AS branch_name
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.performed_by
       JOIN branches b ON b.id = sm.branch_id
       WHERE sm.product_id = $1
       ORDER BY sm.movement_date DESC
       LIMIT 20`,
      [req.params.id]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...productResult.rows[0],
        inventory: inventoryResult.rows,
        movements: movementsResult.rows,
      },
    });
  } catch (err) {
    console.error('[Products] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch product.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/products  — Create product
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, sku, category, description, unit_price, unit_type, barcode, supplier_id, reorder_point } = req.body;

    if (!name || !sku) {
      return res.status(400).json({ success: false, message: 'name and sku are required.' });
    }

    // Check SKU uniqueness
    const skuCheck = await pool.query(`SELECT id FROM products WHERE sku = $1`, [sku.toUpperCase().trim()]);
    if (skuCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'SKU already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO products (name, sku, category, description, unit_price, unit_type, barcode, supplier_id, reorder_point)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        name.trim(), sku.toUpperCase().trim(), category || null,
        description || null, Number(unit_price) || 0, unit_type || 'Unit',
        barcode || null, supplier_id ? Number(supplier_id) : null, Number(reorder_point) || 5,
      ]
    );

    return res.status(201).json({ success: true, message: 'Product created.', data: result.rows[0] });
  } catch (err) {
    console.error('[Products] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create product.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/products/:id  — Update product
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, category, description, unit_price, unit_type, barcode, supplier_id, reorder_point, status } = req.body;

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (name)            { updates.push(`name = $${pIdx++}`);          params.push(name.trim()); }
    if (category !== undefined) { updates.push(`category = $${pIdx++}`); params.push(category || null); }
    if (description !== undefined) { updates.push(`description = $${pIdx++}`); params.push(description || null); }
    if (unit_price !== undefined)  { updates.push(`unit_price = $${pIdx++}`);  params.push(Number(unit_price)); }
    if (unit_type)       { updates.push(`unit_type = $${pIdx++}`);     params.push(unit_type); }
    if (barcode !== undefined) { updates.push(`barcode = $${pIdx++}`); params.push(barcode || null); }
    if (supplier_id !== undefined) { updates.push(`supplier_id = $${pIdx++}`); params.push(supplier_id ? Number(supplier_id) : null); }
    if (reorder_point !== undefined) { updates.push(`reorder_point = $${pIdx++}`); params.push(Number(reorder_point)); }
    if (status)          { updates.push(`status = $${pIdx++}`);        params.push(status); }

    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    params.push(Number(req.params.id));
    const result = await pool.query(
      `UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.status(200).json({ success: true, message: 'Product updated.', data: result.rows[0] });
  } catch (err) {
    console.error('[Products] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update product.' });
  }
});

export default router;
