import express from 'express';
import { allow, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import { normalizeProductName, productNameConflict, productNameTaken } from '../lib/productName.js';
import {
  deleteProductImage,
  detectProductImage,
  productImageUrl,
  saveProductImage,
} from '../lib/productImages.js';

const router = express.Router();
router.use(allow(ROLE_SETS.catalogRead, ROLE_SETS.catalogWrite));

const PRODUCT_DELETE_ROLES = ['operating_manager', 'super_admin'];
/** Only OM / super_admin may list or open archived (Inactive) products. */
const PRODUCT_ARCHIVE_VIEW_ROLES = new Set(['operating_manager', 'super_admin']);

function canViewArchivedProducts(user) {
  return PRODUCT_ARCHIVE_VIEW_ROLES.has(user?.roleSlug);
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/products
// Query params: branch_id, category, status, search, page, limit
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branch_id, category, status, product_status, search, page = 1, limit = 50 } = req.query;

    // Branch staff always see their branch stock only.
    const scopedBranchId = !isUnscoped(user) && user.branchId != null
      ? Number(user.branchId)
      : (branch_id ? Number(branch_id) : null);

    const conditions = [];
    const params = [];
    let pIdx = 1;

    // Archived products are hidden from warehouse/sales/BM/etc.
    // Only operating managers (and super_admin) may request Inactive or All.
    const productStatus = String(product_status || '').trim();
    const allowArchived = canViewArchivedProducts(user);
    if (allowArchived && ['Active', 'Inactive'].includes(productStatus)) {
      conditions.push(`p.status = $${pIdx++}`);
      params.push(productStatus);
    } else if (allowArchived && productStatus.toLowerCase() === 'all') {
      // no status filter — include Active + archived
    } else {
      conditions.push("p.status = 'Active'");
    }

    let branchJoinParam = null;
    if (scopedBranchId != null && Number.isFinite(scopedBranchId)) {
      branchJoinParam = pIdx++;
      params.push(scopedBranchId);
    }
    if (category) {
      conditions.push(`p.category_id = $${pIdx++}`);
      params.push(Number(category));
    }
    if (status && scopedBranchId != null) {
      conditions.push(`i.stock_status = $${pIdx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(p.name ILIKE $${pIdx} OR p.sku ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);
    const limitIdx = pIdx++;
    const offsetIdx = pIdx++;
    params.push(Number(limit), offset);

    let query;
    if (branchJoinParam != null) {
      query = `
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.sku,
          p.category_id,
          pc.category_name,
          p.unit_price,
          p.status,
          p.image_url,
          i.quantity, i.stock_status, i.last_updated,
          b.name AS branch_name
        FROM products p
        LEFT JOIN product_categories pc ON pc.category_id = p.category_id
        LEFT JOIN branch_inventory i ON i.product_id = p.id AND i.branch_id = $${branchJoinParam}
        LEFT JOIN branches b ON b.id = i.branch_id
        ${where}
        ORDER BY p.name
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
    } else {
      query = `
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.sku,
          p.category_id,
          pc.category_name,
          p.unit_price,
          p.status,
          p.image_url,
          COALESCE(SUM(i.quantity), 0) AS total_quantity,
          CASE
            WHEN COALESCE(SUM(i.quantity), 0) = 0 THEN 'Out of Stock'
            WHEN COALESCE(SUM(i.quantity), 0) <= 10 THEN 'Low Stock'
            ELSE 'Sufficient'
          END AS stock_status
        FROM products p
        LEFT JOIN product_categories pc ON pc.category_id = p.category_id
        LEFT JOIN branch_inventory i ON i.product_id = p.id
        ${where}
        GROUP BY p.id, p.sku, p.category_id, pc.category_name, p.unit_price, p.status, p.image_url
        ORDER BY p.name
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
    }

    const result = await pool.query(query, params);

    const cats = await pool.query(
      `SELECT category_id, category_name FROM product_categories WHERE status='Active' ORDER BY category_name`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      categories: cats.rows.map((r) => ({ category_id: r.category_id, category_name: r.category_name })),
    });
  } catch (err) {
    console.error('[Products] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/products/:id  — Product detail; branch roles only see own-branch stock
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const scopedBranchId = !isUnscoped(user) && user.branchId != null
      ? Number(user.branchId)
      : null;

    const productResult = await pool.query(
      `SELECT p.id AS product_id,
              p.name AS product_name,
              p.sku,
              p.category_id,
              pc.category_name,
              p.unit_price,
              p.status,
              p.image_url,
              p.description,
              p.unit_type,
              p.reorder_point,
              p.supplier_id
       FROM products p
       LEFT JOIN product_categories pc ON pc.category_id = p.category_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (
      String(productResult.rows[0].status) === 'Inactive'
      && !canViewArchivedProducts(user)
    ) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or has been archived.',
      });
    }

    const inventoryParams = scopedBranchId != null
      ? [req.params.id, scopedBranchId]
      : [req.params.id];
    const inventoryResult = await pool.query(
      `SELECT
         i.inventory_id AS branch_inventory_id,
         i.branch_id,
         b.name    AS branch_name,
         i.product_id,
         i.available_stock,
         i.reorder_level,
         i.stock_status,
         i.last_updated,
         i.created_at,
         i.updated_at
       FROM branch_inventory i
       JOIN branches b ON b.id = i.branch_id
       WHERE i.product_id = $1
         ${scopedBranchId != null ? 'AND i.branch_id = $2' : ''}
       ORDER BY b.name`,
      inventoryParams
    );

    const movementsResult = await pool.query(
      `SELECT sm.*, u.full_name AS performed_by_name, b.name AS branch_name
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.performed_by
       JOIN branches b ON b.id = sm.branch_id
       WHERE sm.product_id = $1
         ${scopedBranchId != null ? 'AND sm.branch_id = $2' : ''}
       ORDER BY sm.movement_date DESC
       LIMIT 20`,
      inventoryParams
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

function readProductImageBody(req, res, next) {
  express.raw({ type: () => true, limit: '2mb' })(req, res, (error) => {
    if (!error) return next();
    if (error.status === 413 || error.type === 'entity.too.large') {
      return res.status(413).json({ success: false, message: 'Image must be 2 MB or smaller.' });
    }
    return next(error);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/products/:id/image  — Replace the product photo
// DELETE /api/products/:id/image — Remove the product photo
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/image', readProductImageBody, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid product id.' });
    }
    const detected = detectProductImage(req.body);
    if (!detected) {
      return res.status(400).json({
        success: false,
        message: 'Choose a JPG, PNG, or WebP image up to 2 MB.',
      });
    }
    const existing = await pool.query(`SELECT id FROM products WHERE id = $1`, [productId]);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    await saveProductImage(productId, req.body, detected.ext);
    const imageUrl = productImageUrl(productId);
    await pool.query(
      `UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2`,
      [imageUrl, productId]
    );
    return res.status(200).json({
      success: true,
      message: 'Product image saved.',
      data: { product_id: productId, image_url: imageUrl },
    });
  } catch (err) {
    console.error('[Products] POST /:id/image error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save product image.' });
  }
});

router.delete('/:id/image', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid product id.' });
    }
    const existing = await pool.query(`SELECT id FROM products WHERE id = $1`, [productId]);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    await deleteProductImage(productId);
    await pool.query(
      `UPDATE products SET image_url = NULL, updated_at = NOW() WHERE id = $1`,
      [productId]
    );
    return res.status(200).json({
      success: true,
      message: 'Product image removed.',
      data: { product_id: productId, image_url: null },
    });
  } catch (err) {
    console.error('[Products] DELETE /:id/image error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to remove product image.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/products  — Create product
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, sku, category_id, description, unit_price, unit_type, barcode, supplier_id, reorder_point, image_url } = req.body;
    const productName = normalizeProductName(name);
    const normalizedImage = typeof image_url === 'string' && image_url.trim() ? image_url.trim() : null;

    if (!productName || !sku) {
      return res.status(400).json({ success: false, message: 'name and sku are required.' });
    }
    if (normalizedImage && !(normalizedImage.startsWith('data:image/') || /^https?:\/\//i.test(normalizedImage))) {
      return res.status(400).json({ success: false, message: 'image_url must be an image upload or URL.' });
    }
    if (await productNameTaken(pool, productName)) {
      return res.status(409).json({ success: false, message: 'A product with this name already exists.' });
    }

    const skuCheck = await pool.query(`SELECT id FROM products WHERE sku = $1`, [sku.toUpperCase().trim()]);
    if (skuCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'SKU already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO products (name, sku, category_id, description, unit_price, unit_type, barcode, supplier_id, reorder_point, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id AS product_id`,
      [
        productName,
        sku.toUpperCase().trim(),
        category_id ? Number(category_id) : null,
        description || null,
        Number(unit_price) || 0,
        unit_type || 'Unit',
        barcode || null,
        supplier_id ? Number(supplier_id) : null,
        Number(reorder_point) || 5,
        normalizedImage,
      ]
    );

    return res.status(201).json({ success: true, message: 'Product created.', data: result.rows[0] });
  } catch (err) {
    const nameConflict = productNameConflict(err);
    if (nameConflict) return res.status(409).json({ success: false, message: nameConflict });
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
    const { name, category_id, description, unit_price, unit_type, barcode, supplier_id, reorder_point, status, image_url } = req.body;
    const productId = Number(req.params.id);
    const productName = name !== undefined ? normalizeProductName(name) : undefined;

    const existing = await pool.query(`SELECT id FROM products WHERE id = $1`, [productId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (name !== undefined && !productName) {
      return res.status(400).json({ success: false, message: 'A product name is required.' });
    }
    if (productName && await productNameTaken(pool, productName, productId)) {
      return res.status(409).json({ success: false, message: 'A product with this name already exists.' });
    }
    if (image_url !== undefined && image_url !== null && String(image_url).trim()) {
      const normalizedImage = String(image_url).trim();
      if (!(normalizedImage.startsWith('data:image/') || /^https?:\/\//i.test(normalizedImage))) {
        return res.status(400).json({ success: false, message: 'image_url must be an image upload or URL.' });
      }
    }

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (productName) { updates.push(`name = $${pIdx++}`); params.push(productName); }
    if (category_id !== undefined) { updates.push(`category_id = $${pIdx++}`); params.push(category_id ? Number(category_id) : null); }
    if (description !== undefined) { updates.push(`description = $${pIdx++}`); params.push(description || null); }
    if (unit_price !== undefined) { updates.push(`unit_price = $${pIdx++}`); params.push(Number(unit_price)); }
    if (unit_type) { updates.push(`unit_type = $${pIdx++}`); params.push(unit_type); }
    if (barcode !== undefined) { updates.push(`barcode = $${pIdx++}`); params.push(barcode || null); }
    if (supplier_id !== undefined) { updates.push(`supplier_id = $${pIdx++}`); params.push(supplier_id ? Number(supplier_id) : null); }
    if (reorder_point !== undefined) { updates.push(`reorder_point = $${pIdx++}`); params.push(Number(reorder_point)); }
    if (status) { updates.push(`status = $${pIdx++}`); params.push(status); }
    if (image_url !== undefined) {
      updates.push(`image_url = $${pIdx++}`);
      params.push(image_url && String(image_url).trim() ? String(image_url).trim() : null);
    }

    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    params.push(productId);
    const result = await pool.query(
      `UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx} RETURNING id AS product_id`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.status(200).json({ success: true, message: 'Product updated.', data: result.rows[0] });
  } catch (err) {
    const nameConflict = productNameConflict(err);
    if (nameConflict) return res.status(409).json({ success: false, message: nameConflict });
    console.error('[Products] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update product.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/products/:id
// Query: mode=archive (default) | mode=hard
// Archive sets status=Inactive. Hard delete only when no operational refs remain.
// Hard delete: operating_manager / super_admin only.
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const productId = Number(req.params.id);
    const mode = String(req.query.mode || 'archive').toLowerCase();

    if (!Number.isFinite(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product id.' });
    }

    const existing = await pool.query(
      `SELECT id, name, sku, status FROM products WHERE id = $1`,
      [productId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (mode === 'hard') {
      if (!PRODUCT_DELETE_ROLES.includes(req.currentUser?.roleSlug)) {
        return res.status(403).json({
          success: false,
          message: 'Only operating managers can permanently delete products.',
        });
      }

      const refs = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM branch_inventory WHERE product_id = $1) AS inventory_rows,
           (SELECT COUNT(*)::int FROM sales_invoice_items WHERE product_id = $1) AS sale_rows,
           (SELECT COUNT(*)::int FROM stock_movements WHERE product_id = $1) AS movement_rows,
           (SELECT COUNT(*)::int FROM restocks WHERE product_id = $1) AS restock_rows,
           (SELECT COUNT(*)::int FROM inventory_transfers WHERE product_id = $1) AS transfer_rows,
           (SELECT COUNT(*)::int FROM central_inventory WHERE product_id = $1) AS central_rows`,
        [productId]
      );
      const usage = refs.rows[0] || {};
      const blocking = Object.entries(usage)
        .filter(([, count]) => Number(count) > 0)
        .map(([key, count]) => `${key.replace(/_rows$/, '')}: ${count}`);

      if (blocking.length) {
        return res.status(409).json({
          success: false,
          message: `Cannot permanently delete this product because it is still referenced (${blocking.join(', ')}). Archive it instead.`,
          data: usage,
        });
      }

      await deleteProductImage(productId);
      await pool.query(`DELETE FROM products WHERE id = $1`, [productId]);
      return res.status(200).json({
        success: true,
        message: 'Product permanently deleted.',
        data: { product_id: productId, mode: 'hard' },
      });
    }

    // Soft archive
    if (existing.rows[0].status === 'Inactive') {
      return res.status(200).json({
        success: true,
        message: 'Product is already archived.',
        data: { product_id: productId, status: 'Inactive', mode: 'archive' },
      });
    }

    await pool.query(
      `UPDATE products SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [productId]
    );

    return res.status(200).json({
      success: true,
      message: 'Product archived.',
      data: { product_id: productId, status: 'Inactive', mode: 'archive' },
    });
  } catch (err) {
    console.error('[Products] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete product.' });
  }
});

export default router;
