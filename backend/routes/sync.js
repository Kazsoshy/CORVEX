import express from 'express';
import { acceptOfflineBatch, listOfflineQueue } from '../lib/offlineSync.js';

const router = express.Router();

router.get('/queue', async (req, res) => {
  try {
    const rows = await listOfflineQueue(req.app.locals.pool, req.currentUser.id);
    return res.status(200).json({ success: true, data: rows, count: rows.length });
  } catch (error) {
    console.error('[Sync] GET /queue error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load the sync queue.' });
  }
});

router.post('/queue', async (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ success: false, message: 'records must be a non-empty list.' });
  }
  try {
    const results = await acceptOfflineBatch(req.app.locals.pool, req.currentUser, {
      deviceId: req.body?.deviceId,
      records,
    });
    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('[Sync] POST /queue error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to accept offline records.' });
  }
});

export default router;
