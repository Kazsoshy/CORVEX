import express from 'express';

const router = express.Router();

// GET /api/notifications — current user's notifications
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const result = await pool.query(
      `SELECT
         n.id AS notification_id,
         n.title,
         n.message,
         n.status,
         n.category,
         n.created_at
       FROM notifications n
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 200`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('[Notifications] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.currentUser?.id;
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET status = 'Read'
       WHERE id = $1 AND user_id = $2
       RETURNING id AS notification_id, title, message, status, category, created_at`,
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Notifications] PATCH /:id/read error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update notification.' });
  }
});

export default router;
