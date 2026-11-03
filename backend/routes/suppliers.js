import express from 'express';
import { allow, isUnscoped, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
// Warehouse/BM: read-only. OM/super_admin: create, edit, archive.
router.use(allow(ROLE_SETS.suppliersRead, ROLE_SETS.suppliersWrite));

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/suppliers
// Query params: status, search, page, limit
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { status, search, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (status) {
      conditions.push(`s.status = $${pIdx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(s.supplier_name ILIKE $${pIdx} OR s.contact ILIKE $${pIdx} OR s.email ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM suppliers s ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT
         s.suppliers_id,
         s.supplier_name,
         s.contact,
         s.contact AS contact_number,
         s.email,
         s.address,
         s.status,
         s.created_at,
         s.updated_at
       FROM suppliers s
       ${where}
       ORDER BY s.supplier_name
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, Number(limit), offset]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error('[Suppliers] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch suppliers.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/suppliers/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const result = await pool.query(
      `SELECT
         s.suppliers_id,
         s.supplier_name,
         s.contact,
         s.contact AS contact_number,
         s.email,
         s.address,
         s.status,
         s.created_at,
         s.updated_at
       FROM suppliers s
       WHERE s.suppliers_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    const restockParams = [req.params.id];
    let branchSql = '';
    if (!isUnscoped(user) && user.branchId != null) {
      branchSql = ' AND h.branch_id = $2';
      restockParams.push(user.branchId);
    }

    const restocks = await pool.query(
      `SELECT
         h.restock_id,
         h.restock_ref,
         h.delivery_ref,
         h.received_date,
         rec.full_name AS recorded_by_name,
         COALESCE(agg.line_count, 0)::int AS line_count,
         COALESCE(agg.total_quantity, 0)::int AS total_quantity
       FROM restock_headers h
       LEFT JOIN users rec ON rec.id = h.recorded_by
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS line_count,
           COALESCE(SUM(l.quantity), 0)::int AS total_quantity
         FROM restock_lines l
         WHERE l.restock_id = h.restock_id
       ) agg ON TRUE
       WHERE h.supplier_id = $1${branchSql}
       ORDER BY h.received_date DESC, h.restock_id DESC
       LIMIT 20`,
      restockParams
    );

    return res.status(200).json({
      success: true,
      data: {
        ...result.rows[0],
        recent_restocks: restocks.rows,
      },
    });
  } catch (err) {
    console.error('[Suppliers] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch supplier.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/suppliers
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { supplier_name, contact, contact_number, email, address, status } = req.body;
    const contactValue = contact ?? contact_number;

    if (!supplier_name) {
      return res.status(400).json({ success: false, message: 'supplier_name is required.' });
    }

    const result = await pool.query(
      `INSERT INTO suppliers (supplier_name, contact, email, address, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING suppliers_id, supplier_name, contact, email, address, status, created_at, updated_at`,
      [
        supplier_name.trim(),
        typeof contactValue === 'string' ? contactValue.trim() || null : null,
        email?.trim() || null,
        address?.trim() || null,
        status || 'Active',
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Supplier created successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Suppliers] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create supplier.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/suppliers/:id
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { supplier_name, contact, contact_number, email, address, status } = req.body;
    const contactValue = contact !== undefined ? contact : contact_number;

    const existing = await pool.query(`SELECT suppliers_id FROM suppliers WHERE suppliers_id = $1`, [Number(req.params.id)]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (supplier_name !== undefined) { updates.push(`supplier_name = $${pIdx++}`); params.push(supplier_name.trim()); }
    if (contactValue !== undefined) {
      updates.push(`contact = $${pIdx++}`);
      params.push(typeof contactValue === 'string' ? contactValue.trim() || null : null);
    }
    if (email !== undefined) { updates.push(`email = $${pIdx++}`); params.push(email?.trim() || null); }
    if (address !== undefined) { updates.push(`address = $${pIdx++}`); params.push(address?.trim() || null); }
    if (status !== undefined) { updates.push(`status = $${pIdx++}`); params.push(status); }

    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    updates.push(`updated_at = NOW()`);
    params.push(Number(req.params.id));

    const result = await pool.query(
      `UPDATE suppliers SET ${updates.join(', ')} WHERE suppliers_id = $${pIdx} RETURNING suppliers_id, supplier_name, contact, email, address, status, created_at, updated_at`,
      params
    );

    return res.status(200).json({
      success: true,
      message: 'Supplier updated successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Suppliers] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update supplier.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/suppliers/:id  — Soft archive (status = Inactive; record kept)
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const supplierId = Number(req.params.id);

    const existing = await pool.query(
      `SELECT suppliers_id, status FROM suppliers WHERE suppliers_id = $1`,
      [supplierId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }
    if (existing.rows[0].status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'Supplier is already archived.' });
    }

    const linked = await pool.query(
      `SELECT COUNT(*)::int AS c FROM restock_headers WHERE supplier_id = $1`,
      [supplierId]
    );
    const linkedCount = Number(linked.rows[0]?.c) || 0;

    await pool.query(
      `UPDATE suppliers SET status = 'Inactive', updated_at = NOW() WHERE suppliers_id = $1`,
      [supplierId]
    );

    return res.status(200).json({
      success: true,
      message: linkedCount > 0
        ? `Supplier archived. ${linkedCount} historical restock(s) are preserved; this supplier cannot be used on new restocks.`
        : 'Supplier archived successfully. The record is preserved.',
      data: { linked_restocks: linkedCount },
    });
  } catch (err) {
    console.error('[Suppliers] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to archive supplier.' });
  }
});

export default router;
