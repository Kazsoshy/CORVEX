import express from 'express';
import { requirePermission } from '../middleware/auth.js';
import {
  getSecuritySummary,
  listSecurityEvents,
  updateSecurityEventStatus,
} from '../lib/security/eventStore.js';
import { analyzeFailedLogins, assessInsecureConfiguration } from '../lib/security/detectors.js';
import { runDependencyVulnerabilityAudit } from '../lib/security/dependencyAudit.js';
import { scanUploadDirectory } from '../lib/security/malwareScanner.js';

const router = express.Router();
router.use(requirePermission('security.view', 'security.events', 'security.manage'));

// GET /api/security/summary — dashboard KPIs + monitor health + recent events
router.get('/summary', requirePermission('security.view'), async (req, res) => {
  try {
    const data = await getSecuritySummary(req.app.locals.pool);
    const healthRows = data.health || [];
    const active = healthRows.filter((h) => h.status === 'Active').length;
    const unavailable = healthRows.filter((h) => h.status === 'Unavailable').length;
    const overall =
      unavailable === healthRows.length
        ? 'Unavailable'
        : unavailable > 0 || healthRows.some((h) => h.status === 'Degraded')
          ? 'Degraded'
          : 'Active';

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        monitorOverall: overall,
        monitorActiveComponents: active,
        monitorComponentCount: healthRows.length,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Security] GET /summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load security summary.' });
  }
});

// GET /api/security/events
router.get('/events', requirePermission('security.view', 'security.events'), async (req, res) => {
  try {
    const { severity, status, threat_type: threatType, limit = 50, offset = 0 } = req.query;
    const rows = await listSecurityEvents(req.app.locals.pool, {
      severity,
      status,
      threatType,
      limit,
      offset,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('[Security] GET /events error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load security events.' });
  }
});

// PATCH /api/security/events/:id — update investigation status (no destructive auto-actions)
router.patch('/events/:id', requirePermission('security.manage'), async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    const { status, note } = req.body || {};
    const allowed = new Set(['Open', 'Investigating', 'Resolved', 'False Positive']);
    if (!allowed.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    const row = await updateSecurityEventStatus(req.app.locals.pool, eventId, status, note || null);
    if (!row) return res.status(404).json({ success: false, message: 'Event not found.' });
    return res.status(200).json({ success: true, data: row });
  } catch (err) {
    console.error('[Security] PATCH /events/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update security event.' });
  }
});

/**
 * POST /api/security/sweep
 * Manual "run detectors now" for admins — optional; background jobs already run automatically.
 * Does not fabricate threats; executes the same real detectors.
 */
router.post('/sweep', requirePermission('security.manage'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const [auth, config, files, deps] = await Promise.allSettled([
      analyzeFailedLogins(pool),
      assessInsecureConfiguration(pool),
      scanUploadDirectory(pool),
      runDependencyVulnerabilityAudit(pool),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Security sweep completed.',
      data: {
        auth: auth.status === 'fulfilled' ? auth.value : { error: auth.reason?.message },
        config: config.status === 'fulfilled' ? config.value : { error: config.reason?.message },
        files: files.status === 'fulfilled' ? files.value : { error: files.reason?.message },
        dependencies: deps.status === 'fulfilled' ? deps.value : { error: deps.reason?.message },
      },
    });
  } catch (err) {
    console.error('[Security] POST /sweep error:', err.message);
    return res.status(500).json({ success: false, message: 'Security sweep failed.' });
  }
});

export default router;
