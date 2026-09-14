import express from 'express';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/territories
// Query params: branch_id, search
// Note: If requireBranchScope is used in server.js, req.currentUser.branchId
// will enforce branch restrictions.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { branch_id, search } = req.query;
    const user = req.currentUser;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    // Enforce branch scope if the user is scoped (Branch Manager)
    if (user?.branchId) {
      conditions.push(`t.branch_id = $${pIdx++}`);
      params.push(user.branchId);
    } else if (branch_id) {
      // Operating manager can filter by branch
      conditions.push(`t.branch_id = $${pIdx++}`);
      params.push(Number(branch_id));
    }

    if (search) {
      conditions.push(`(t.territory_name ILIKE $${pIdx} OR t.coverage_area ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         t.territory_id,
         t.territory_name,
         t.branch_id,
         b.name AS branch_name,
         t.assigned_user,
         u.full_name AS assigned_user_name,
         t.coverage_area
       FROM territories t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN users u ON u.id = t.assigned_user
       ${where}
       ORDER BY t.territory_name`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error('[Territories] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch territories.', error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/territories
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { territory_name, branch_id, assigned_user, coverage_area } = req.body;
    const user = req.currentUser;

    if (!territory_name) {
      return res.status(400).json({ success: false, message: 'territory_name is required.' });
    }

    // Branch manager cannot create territory for another branch
    const finalBranchId = user?.branchId || branch_id;
    if (!finalBranchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required.' });
    }

    const result = await pool.query(
      `INSERT INTO territories (territory_name, branch_id, assigned_user, coverage_area)
       VALUES ($1, $2, $3, $4)
       RETURNING territory_id, territory_name, branch_id, assigned_user, coverage_area`,
      [
        territory_name.trim(),
        Number(finalBranchId),
        assigned_user ? Number(assigned_user) : null,
        coverage_area?.trim() || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Territory created successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Territories] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create territory.', error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/territories/:id
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { territory_name, branch_id, assigned_user, coverage_area } = req.body;
    const user = req.currentUser;

    const existing = await pool.query(`SELECT branch_id FROM territories WHERE territory_id = $1`, [Number(req.params.id)]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Territory not found.' });
    }

    // Enforce branch scope
    if (user?.branchId && existing.rows[0].branch_id !== user.branchId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (territory_name !== undefined) { updates.push(`territory_name = $${pIdx++}`); params.push(territory_name.trim()); }
    if (branch_id !== undefined && !user?.branchId) { updates.push(`branch_id = $${pIdx++}`); params.push(Number(branch_id)); }
    if (assigned_user !== undefined) { updates.push(`assigned_user = $${pIdx++}`); params.push(assigned_user ? Number(assigned_user) : null); }
    if (coverage_area !== undefined) { updates.push(`coverage_area = $${pIdx++}`); params.push(coverage_area?.trim() || null); }

    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    params.push(Number(req.params.id));
    const result = await pool.query(
      `UPDATE territories SET ${updates.join(', ')} WHERE territory_id = $${pIdx} RETURNING territory_id, territory_name, branch_id, assigned_user, coverage_area`,
      params
    );

    return res.status(200).json({
      success: true,
      message: 'Territory updated successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Territories] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update territory.', error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/territories/:id
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const existing = await pool.query(`SELECT branch_id FROM territories WHERE territory_id = $1`, [Number(req.params.id)]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Territory not found.' });
    }

    // Enforce branch scope
    if (user?.branchId && existing.rows[0].branch_id !== user.branchId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Check if it's referenced in customers table
    const refCheck = await pool.query(`SELECT customer_id FROM customers WHERE territory_id = $1 LIMIT 1`, [Number(req.params.id)]);
    if (refCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Cannot delete territory. It is currently assigned to one or more customers.' });
    }

    await pool.query(`DELETE FROM territories WHERE territory_id = $1`, [Number(req.params.id)]);

    return res.status(200).json({
      success: true,
      message: 'Territory deleted successfully.',
    });
  } catch (err) {
    console.error('[Territories] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete territory.', error: err.message });
  }
});

export default router;
