import express from 'express';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();
router.use(requirePermission('audit.view', 'audit.details'));

function firstOfDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-logs
// Fetch audit logs with enriched fields and optional filters
// ──────────────────────────────────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      search = '',
      user = '',
      role = '',
      module = '',
      activity = '',
      status = '',
      date_from = '',
      date_to = '',
      limit = '500',
    } = req.query;

    const whereParts = [];
    const params = [];
    let idx = 1;

    if (String(search).trim()) {
      whereParts.push(`(
        COALESCE(a.user_name, '') ILIKE $${idx}
        OR COALESCE(a.action, '') ILIKE $${idx}
        OR COALESCE(a.status_details, '') ILIKE $${idx}
        OR COALESCE(a.description, '') ILIKE $${idx}
        OR COALESCE(a.activity, '') ILIKE $${idx}
        OR COALESCE(a.module, '') ILIKE $${idx}
        OR COALESCE(a.ip_address, '') ILIKE $${idx}
        OR COALESCE(a.affected_record, '') ILIKE $${idx}
        OR COALESCE(a.role_name, '') ILIKE $${idx}
        OR COALESCE(a.status, '') ILIKE $${idx}
      )`);
      params.push(`%${String(search).trim()}%`);
      idx += 1;
    }

    if (String(user).trim() && String(user) !== 'all') {
      const u = String(user).trim();
      whereParts.push(`(CAST(a.user_id AS TEXT) = $${idx} OR a.user_name = $${idx + 1})`);
      params.push(u, u);
      idx += 2;
    }

    if (String(role).trim() && String(role) !== 'all') {
      whereParts.push(`COALESCE(a.role_name, r.role_name, '') ILIKE $${idx}`);
      params.push(`%${String(role).trim()}%`);
      idx += 1;
    }

    if (String(module).trim() && String(module) !== 'all') {
      whereParts.push(`COALESCE(a.module, '') ILIKE $${idx}`);
      params.push(`%${String(module).trim()}%`);
      idx += 1;
    }

    if (String(activity).trim() && String(activity) !== 'all') {
      whereParts.push(`COALESCE(a.activity, a.action, '') ILIKE $${idx}`);
      params.push(`%${String(activity).trim()}%`);
      idx += 1;
    }

    if (String(status).trim() && String(status) !== 'all') {
      whereParts.push(`COALESCE(a.status, a.status_details, '') ILIKE $${idx}`);
      params.push(`%${String(status).trim()}%`);
      idx += 1;
    }

    const from = firstOfDay(date_from);
    if (from) {
      whereParts.push(`a.created_at >= $${idx}`);
      params.push(from.toISOString());
      idx += 1;
    }

    const to = endOfDay(date_to);
    if (to) {
      whereParts.push(`a.created_at <= $${idx}`);
      params.push(to.toISOString());
      idx += 1;
    }

    const lim = Math.min(Math.max(Number(limit) || 500, 1), 2000);
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         a.log_id,
         a.user_id,
         COALESCE(
           NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
           a.user_name,
           'System'
         ) AS user_name,
         COALESCE(a.role_name, r.role_name) AS role_name,
         COALESCE(
           NULLIF(a.module, ''),
           CASE
             WHEN a.action ILIKE '%login%' OR a.status_details ILIKE '%login%' THEN 'Authentication'
             WHEN a.action ILIKE '%user%' THEN 'User Management'
             WHEN a.action ILIKE '%permission%' OR a.action ILIKE '%role%' THEN 'Roles and Permissions'
             ELSE NULL
           END
         ) AS module,
         COALESCE(NULLIF(a.activity, ''), a.action) AS activity,
         a.action,
         COALESCE(NULLIF(a.description, ''), a.status_details, a.action) AS description,
         COALESCE(NULLIF(a.status, ''), a.status_details, a.action) AS status,
         a.status_details,
         a.ip_address,
         a.affected_record,
         a.created_at,
         (a.created_at::date) AS activity_date
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN roles r ON u.role_id = r.role_id
       ${whereSql}
       ORDER BY a.created_at DESC
       LIMIT $${idx}`,
      [...params, lim]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42703') {
      try {
        const result = await req.app.locals.pool.query(
          `SELECT a.log_id, a.user_id,
                  COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), a.user_name) AS user_name,
                  a.action, a.ip_address, a.status_details, a.created_at,
                  a.action AS activity, a.status_details AS description, a.status_details AS status,
                  NULL::text AS role_name, NULL::text AS module, NULL::text AS affected_record,
                  (a.created_at::date) AS activity_date
           FROM audit_logs a
           LEFT JOIN users u ON a.user_id = u.id
           ORDER BY a.created_at DESC
           LIMIT 500`
        );
        return res.status(200).json({ success: true, data: result.rows });
      } catch (inner) {
        console.error('[Admin] GET /audit-logs fallback error:', inner.message);
      }
    }
    console.error('[Admin] GET /audit-logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

export default router;
