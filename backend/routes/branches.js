import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/branches
// Creates a new branch (Operating Manager / Super Admin only)
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole(['operating_manager', 'super_admin']), async (req, res) => {
  const { name, region, city, status } = req.body;

  if (!name || !region || !city) {
    return res.status(400).json({ success: false, message: 'Name, region, and city are required.' });
  }

  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `INSERT INTO branches (name, region, city, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, region, city, status, created_at`,
      [name, region, city, status || 'Active']
    );

    return res.status(201).json({
      success: true,
      message: 'Branch created successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Branches API] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create branch.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branches
// List all branches (Admin/Operating Manager uses this or dashboard routes)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(`SELECT * FROM branches ORDER BY name ASC`);
    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error('[Branches API] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branches.' });
  }
});

export default router;
