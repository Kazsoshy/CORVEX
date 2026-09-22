import express from 'express';
import { allow, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(allow(ROLE_SETS.suppliers));

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

    const result = await pool.query(
      `SELECT
         s.suppliers_id,
         s.supplier_name,
         s.contact,
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

    return res.status(200).json({
      success: true,
      data: result.rows[0],
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
    const { supplier_name, contact, email, address, status } = req.body;

    if (!supplier_name) {
      return res.status(400).json({ success: false, message: 'supplier_name is required.' });
    }

    const result = await pool.query(
      `INSERT INTO suppliers (supplier_name, contact, email, address, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING suppliers_id, supplier_name, contact, email, address, status, created_at, updated_at`,
      [
        supplier_name.trim(),
        contact?.trim() || null,
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
    const { supplier_name, contact, email, address, status } = req.body;

    const existing = await pool.query(`SELECT suppliers_id FROM suppliers WHERE suppliers_id = $1`, [Number(req.params.id)]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (supplier_name !== undefined) { updates.push(`supplier_name = $${pIdx++}`); params.push(supplier_name.trim()); }
    if (contact !== undefined) { updates.push(`contact = $${pIdx++}`); params.push(contact?.trim() || null); }
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
// DELETE /api/suppliers/:id
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const existing = await pool.query(`SELECT suppliers_id FROM suppliers WHERE suppliers_id = $1`, [Number(req.params.id)]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    await pool.query(`DELETE FROM suppliers WHERE suppliers_id = $1`, [Number(req.params.id)]);

    return res.status(200).json({
      success: true,
      message: 'Supplier deleted successfully.',
    });
  } catch (err) {
    console.error('[Suppliers] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete supplier.' });
  }
});

export default router;
