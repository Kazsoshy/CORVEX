import { insertUserNotification } from '../creditInvestigationNotifications.js';

async function claimDedup(pool, key) {
  const result = await pool.query(
    `INSERT INTO notification_dedup (dedup_key)
     VALUES ($1)
     ON CONFLICT DO NOTHING
     RETURNING dedup_key`,
    [key]
  );
  return result.rows.length > 0;
}

export async function updateMonitorHealth(pool, component, status, detail = null) {
  await pool.query(
    `INSERT INTO security_monitor_health (component, status, last_run_at, last_success_at, detail, updated_at)
     VALUES ($1::varchar, $2::varchar, NOW(), CASE WHEN $2::text = 'Active' THEN NOW() ELSE NULL END, $3::text, NOW())
     ON CONFLICT (component) DO UPDATE SET
       status = EXCLUDED.status,
       last_run_at = NOW(),
       last_success_at = CASE
         WHEN EXCLUDED.status = 'Active' THEN NOW()
         ELSE security_monitor_health.last_success_at
       END,
       detail = COALESCE(EXCLUDED.detail, security_monitor_health.detail),
       updated_at = NOW()`,
    [component, status, detail]
  );
}

export async function notifySuperAdmins(pool, { title, message, eventId }) {
  const admins = await pool.query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active' AND r.slug = 'super_admin'`
  );
  if (!admins.rows.length) return;

  const dedupKey = `security-alert:${eventId}`;
  const fresh = await claimDedup(pool, dedupKey);
  if (!fresh) return;

  await Promise.all(
    admins.rows.map((row) =>
      insertUserNotification(pool, {
        userId: row.id,
        title,
        message,
        category: 'Security',
      })
    )
  );

  await pool.query(
    `UPDATE security_events SET notified_at = NOW(), updated_at = NOW() WHERE event_id = $1`,
    [eventId]
  );
}

/**
 * Persist a security event. Uses event_key uniqueness for open/investigating
 * incidents so duplicate alerts for the same incident are suppressed.
 * Returns { created, event } .
 */
export async function recordSecurityEvent(pool, event) {
  const {
    eventKey,
    threatType,
    severity,
    title,
    description,
    detectionMethod,
    evidence = {},
    sourceIp = null,
    userId = null,
    userName = null,
    affectedResource = null,
    autoAction = null,
  } = event;

  if (!eventKey || !threatType || !severity || !title || !description || !detectionMethod) {
    throw new Error('Incomplete security event payload.');
  }

  const insert = await pool.query(
    `INSERT INTO security_events (
       event_key, threat_type, severity, title, description, detection_method,
       evidence, source_ip, user_id, user_name, affected_resource, auto_action
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7::jsonb, $8, $9, $10, $11, $12
     )
     ON CONFLICT (event_key) WHERE status IN ('Open', 'Investigating')
     DO UPDATE SET
       updated_at = NOW(),
       evidence = security_events.evidence || EXCLUDED.evidence
     RETURNING *, (xmax = 0) AS inserted`,
    [
      String(eventKey).slice(0, 240),
      threatType,
      severity,
      String(title).slice(0, 200),
      description,
      detectionMethod,
      JSON.stringify(evidence || {}),
      sourceIp,
      userId,
      userName,
      affectedResource,
      autoAction,
    ]
  );

  const row = insert.rows[0];
  const created = Boolean(row?.inserted);

  if (created && (severity === 'Critical' || severity === 'High')) {
    try {
      await notifySuperAdmins(pool, {
        title: `[${severity}] ${title}`,
        message: `${description} Detection: ${detectionMethod}.`,
        eventId: row.event_id,
      });
    } catch (err) {
      console.error('[Security] notifySuperAdmins failed:', err.message);
    }
  }

  return { created, event: row };
}

export async function listSecurityEvents(pool, { severity, status, threatType, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;
  if (severity) {
    conditions.push(`severity = $${i++}`);
    params.push(severity);
  }
  if (status) {
    conditions.push(`status = $${i++}`);
    params.push(status);
  }
  if (threatType) {
    conditions.push(`threat_type = $${i++}`);
    params.push(threatType);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM security_events
     ${where}
     ORDER BY created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, Number(limit) || 50, Number(offset) || 0]
  );
  return result.rows;
}

export async function getSecuritySummary(pool) {
  const [counts, openCritical, recent, health] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('Open', 'Investigating'))::int AS open_count,
         COUNT(*) FILTER (WHERE severity = 'Critical' AND status IN ('Open', 'Investigating'))::int AS critical_open,
         COUNT(*) FILTER (WHERE severity = 'High' AND status IN ('Open', 'Investigating'))::int AS high_open,
         COUNT(*) FILTER (WHERE severity = 'Medium' AND status IN ('Open', 'Investigating'))::int AS medium_open,
         COUNT(*) FILTER (WHERE severity = 'Low' AND status IN ('Open', 'Investigating'))::int AS low_open,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h
       FROM security_events`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM security_events
       WHERE severity IN ('Critical', 'High') AND status IN ('Open', 'Investigating')`
    ),
    pool.query(
      `SELECT event_id, threat_type, severity, title, status, created_at, auto_action, source_ip
       FROM security_events ORDER BY created_at DESC LIMIT 8`
    ),
    pool.query(`SELECT * FROM security_monitor_health ORDER BY component`),
  ]);

  return {
    totals: counts.rows[0] || {},
    urgentOpen: openCritical.rows[0]?.c || 0,
    recent: recent.rows,
    health: health.rows,
  };
}

export async function updateSecurityEventStatus(pool, eventId, status, note = null) {
  const result = await pool.query(
    `UPDATE security_events
     SET status = $2,
         description = CASE WHEN $3::text IS NULL OR $3 = '' THEN description ELSE description || E'\n[Status note] ' || $3 END,
         updated_at = NOW()
     WHERE event_id = $1
     RETURNING *`,
    [eventId, status, note]
  );
  return result.rows[0] || null;
}
