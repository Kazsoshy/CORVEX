import express from 'express';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/permissions  — List all permissions
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      `SELECT permission_id, label, description, created_at FROM permissions ORDER BY permission_id`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Permissions] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch permissions.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/permissions  — Create permission
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { label, description } = req.body;
    
    if (!label || !description) {
      return res.status(400).json({ success: false, message: 'Missing label or description.' });
    }
    
    const result = await pool.query(
      `INSERT INTO permissions (label, description) VALUES ($1, $2) RETURNING *`,
      [label.trim(), description.trim()]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Permissions] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create permission.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/permissions/:id  — Update permission
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const permId = Number(req.params.id);
    const { label, description } = req.body;
    
    if (!label || !description) {
      return res.status(400).json({ success: false, message: 'Missing label or description.' });
    }
    
    const check = await pool.query(`SELECT permission_id FROM permissions WHERE permission_id = $1`, [permId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Permission not found.' });
    }
    
    const result = await pool.query(
      `UPDATE permissions SET label = $1, description = $2 WHERE permission_id = $3 RETURNING *`,
      [label.trim(), description.trim(), permId]
    );
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Permissions] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update permission.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/permissions/:id  — Delete permission
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const permId = Number(req.params.id);
    
    const check = await pool.query(`SELECT permission_id FROM permissions WHERE permission_id = $1`, [permId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Permission not found.' });
    }
    
    // Note: CASCADE DELETE in role_permissions will handle mappings
    await pool.query(`DELETE FROM permissions WHERE permission_id = $1`, [permId]);
    return res.status(200).json({ success: true, message: 'Permission deleted successfully.' });
  } catch (err) {
    console.error('[Permissions] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete permission.' });
  }
});

export default router;
