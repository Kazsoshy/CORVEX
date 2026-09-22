import express from 'express';
import { allow, isUnscoped, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(allow(ROLE_SETS.territoryRead, ROLE_SETS.territoryWrite));

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
    if (!isUnscoped(user)) {
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
         r.role_name,
         t.coverage_area,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'user_id', ta.user_id,
               'user_name', TRIM(u2.first_name || ' ' || u2.last_name),
               'role_name', r2.role_name
             )
           ) FILTER (WHERE ta.user_id IS NOT NULL),
           '[]'
         ) AS assigned_users
       FROM territories t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN users u ON u.id = t.assigned_user
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN territory_assignments ta ON t.territory_id = ta.territory_id
       LEFT JOIN users u2 ON u2.id = ta.user_id
       LEFT JOIN roles r2 ON r2.role_id = u2.role_id
       ${where}
       GROUP BY t.territory_id, b.name, u.full_name, r.role_name
       ORDER BY t.territory_name`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error('[Territories] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch territories.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/territories
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { territory_name, branch_id, assigned_user, assigned_users, coverage_area } = req.body;
    const user = req.currentUser;

    if (!territory_name) {
      return res.status(400).json({ success: false, message: 'territory_name is required.' });
    }

    // Branch manager cannot create territory for another branch
    const finalBranchId = isUnscoped(user) ? branch_id : user.branchId;
    if (!finalBranchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required.' });
    }
    
    // Parse assigned_users if it's provided (can be array of integers)
    let userIds = [];
    if (Array.isArray(assigned_users)) {
      userIds = assigned_users.map(Number).filter(id => !isNaN(id) && id > 0);
    } else if (assigned_user) {
      userIds = [Number(assigned_user)];
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO territories (territory_name, branch_id, assigned_user, coverage_area)
         VALUES ($1, $2, $3, $4)
         RETURNING territory_id, territory_name, branch_id, assigned_user, coverage_area`,
        [
          territory_name.trim(),
          Number(finalBranchId),
          userIds.length > 0 ? userIds[0] : null,
          coverage_area?.trim() || null,
        ]
      );
      
      const newTerritoryId = result.rows[0].territory_id;
      
      // Insert multiple assignments
      for (const uid of [...new Set(userIds)]) {
        await client.query(
          `INSERT INTO territory_assignments (territory_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newTerritoryId, uid]
        );
      }
      
      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        message: 'Territory created successfully.',
        data: result.rows[0],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Territories] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create territory.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/territories/:id
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { territory_name, branch_id, assigned_user, assigned_users, coverage_area } = req.body;
    const user = req.currentUser;

    const existing = await pool.query(`SELECT branch_id FROM territories WHERE territory_id = $1`, [Number(req.params.id)]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Territory not found.' });
    }

    // Enforce branch scope
    if (!isUnscoped(user) && Number(existing.rows[0].branch_id) !== Number(user.branchId)) {
      return res.status(403).json({ success: false, message: 'Access denied: you can only access data for your assigned branch.' });
    }
    
    // Parse assigned_users if it's provided
    let userIds = null;
    if (Array.isArray(assigned_users)) {
      userIds = assigned_users.map(Number).filter(id => !isNaN(id) && id > 0);
    } else if (assigned_user !== undefined) {
      userIds = assigned_user ? [Number(assigned_user)] : [];
    }

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (territory_name !== undefined) { updates.push(`territory_name = $${pIdx++}`); params.push(territory_name.trim()); }
    if (branch_id !== undefined && isUnscoped(user)) { updates.push(`branch_id = $${pIdx++}`); params.push(Number(branch_id)); }
    if (userIds !== null && userIds.length > 0) { updates.push(`assigned_user = $${pIdx++}`); params.push(userIds[0]); }
    else if (userIds !== null && userIds.length === 0) { updates.push(`assigned_user = $${pIdx++}`); params.push(null); }
    if (coverage_area !== undefined) { updates.push(`coverage_area = $${pIdx++}`); params.push(coverage_area?.trim() || null); }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let updatedData = {};
      
      if (updates.length > 0) {
        params.push(Number(req.params.id));
        const result = await client.query(
          `UPDATE territories SET ${updates.join(', ')} WHERE territory_id = $${pIdx} RETURNING territory_id, territory_name, branch_id, assigned_user, coverage_area`,
          params
        );
        updatedData = result.rows[0];
      }
      
      if (userIds !== null) {
        await client.query(`DELETE FROM territory_assignments WHERE territory_id = $1`, [Number(req.params.id)]);
        for (const uid of [...new Set(userIds)]) {
          await client.query(
            `INSERT INTO territory_assignments (territory_id, user_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [Number(req.params.id), uid]
          );
        }
      }
      
      await client.query('COMMIT');
      
      return res.status(200).json({
        success: true,
        message: 'Territory updated successfully.',
        data: updatedData,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Territories] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update territory.' });
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
    if (!isUnscoped(user) && Number(existing.rows[0].branch_id) !== Number(user.branchId)) {
      return res.status(403).json({ success: false, message: 'Access denied: you can only access data for your assigned branch.' });
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
    return res.status(500).json({ success: false, message: 'Failed to delete territory.' });
  }
});

export default router;
