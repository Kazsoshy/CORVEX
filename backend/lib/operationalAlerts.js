/**
 * Shared operational-alert service for Dashboard Critical Alerts and Alerts & Exceptions.
 *
 * One source of truth: operational_alerts.
 * Categories are derived from alert_type (no separate category column).
 */

export const ALERT_SEVERITIES = ['Critical', 'Warning', 'Informational'];

export const ALERT_CATEGORIES = [
  'Field Incident',
  'Inventory',
  'Collection',
  'Delinquency',
  'Route Operations',
  'Other',
];

const SEVERITY_RANK = { Critical: 0, Warning: 1, Informational: 2 };

/** Map free-text alert_type → display category. */
export function categorizeAlertType(alertType) {
  const t = String(alertType || '').toLowerCase();
  if (t.includes('field incident') || t.includes('field report')) return 'Field Incident';
  if (t.includes('inventory') || t.includes('stock')) return 'Inventory';
  if (t.includes('delinquen')) return 'Delinquency';
  if (t.includes('collection')) return 'Collection';
  if (t.includes('route') || t.includes('sales completion') || t.includes('visit')) return 'Route Operations';
  return 'Other';
}

function categorySqlFilter(category, paramIndex) {
  const cat = String(category || '').trim();
  if (!cat || cat === 'All') return { sql: '', params: [] };
  if (cat === 'Field Incident') {
    return { sql: `AND (oa.alert_type ILIKE $${paramIndex} OR oa.entity_type = 'field_report')`, params: ['%Field Incident%'] };
  }
  if (cat === 'Inventory') {
    return { sql: `AND (oa.alert_type ILIKE $${paramIndex} OR oa.entity_type IN ('product', 'stock_count'))`, params: ['%Inventor%'] };
  }
  if (cat === 'Delinquency') {
    return { sql: `AND oa.alert_type ILIKE $${paramIndex}`, params: ['%Delinquen%'] };
  }
  if (cat === 'Collection') {
    return { sql: `AND oa.alert_type ILIKE $${paramIndex}`, params: ['%Collection%'] };
  }
  if (cat === 'Route Operations') {
    return {
      sql: `AND (oa.alert_type ILIKE $${paramIndex} OR oa.alert_type ILIKE $${paramIndex + 1} OR oa.alert_type ILIKE $${paramIndex + 2})`,
      params: ['%Route%', '%Sales Completion%', '%Visit%'],
    };
  }
  if (cat === 'Other') {
    return {
      sql: `AND NOT (
        oa.alert_type ILIKE '%Field Incident%'
        OR oa.alert_type ILIKE '%Inventor%'
        OR oa.alert_type ILIKE '%Stock%'
        OR oa.alert_type ILIKE '%Delinquen%'
        OR oa.alert_type ILIKE '%Collection%'
        OR oa.alert_type ILIKE '%Route%'
        OR oa.alert_type ILIKE '%Sales Completion%'
        OR oa.entity_type IN ('field_report', 'product', 'stock_count')
      )`,
      params: [],
    };
  }
  return { sql: `AND oa.alert_type ILIKE $${paramIndex}`, params: [`%${cat}%`] };
}

/**
 * List operational alerts with shared filters/ordering.
 * @param {import('pg').Pool} pool
 * @param {{
 *   branchId?: number|null,
 *   status?: string,
 *   severity?: string,
 *   category?: string,
 *   assignedTo?: number|null,
 *   assignedToMe?: boolean,
 *   userId?: number,
 *   search?: string,
 *   openOnly?: boolean,
 *   criticalFirst?: boolean,
 *   limit?: number,
 * }} opts
 */
export async function listOperationalAlerts(pool, opts = {}) {
  const {
    branchId = null,
    status,
    severity,
    category,
    assignedTo,
    assignedToMe = false,
    userId,
    search,
    openOnly = false,
    criticalFirst = true,
    limit = 200,
  } = opts;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (branchId != null && Number.isFinite(Number(branchId))) {
    conditions.push(`oa.branch_id = $${idx++}`);
    params.push(Number(branchId));
  }

  if (openOnly || status === 'Open') {
    conditions.push(`oa.status = 'Open'`);
  } else if (status && status !== 'All') {
    conditions.push(`oa.status = $${idx++}`);
    params.push(status);
  }

  if (severity && severity !== 'All') {
    conditions.push(`oa.severity = $${idx++}`);
    params.push(severity);
  }

  if (assignedToMe && userId != null) {
    conditions.push(`oa.assigned_to = $${idx++}`);
    params.push(Number(userId));
    if (!status || status === 'All') {
      conditions.push(`oa.status = 'Open'`);
    }
  } else if (assignedTo != null) {
    conditions.push(`oa.assigned_to = $${idx++}`);
    params.push(Number(assignedTo));
  }

  const catFilter = categorySqlFilter(category, idx);
  if (catFilter.sql) {
    conditions.push(catFilter.sql.replace(/^AND\s+/i, ''));
    params.push(...catFilter.params);
    idx += catFilter.params.length;
  }

  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    conditions.push(`(
      oa.title ILIKE $${idx}
      OR oa.message ILIKE $${idx}
      OR oa.alert_type ILIKE $${idx}
      OR COALESCE(asg.full_name, '') ILIKE $${idx}
    )`);
    params.push(q);
    idx += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = criticalFirst
    ? `ORDER BY
         CASE oa.severity WHEN 'Critical' THEN 0 WHEN 'Warning' THEN 1 ELSE 2 END,
         oa.created_at ASC`
    : `ORDER BY oa.created_at DESC`;
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const result = await pool.query(
    `SELECT oa.alert_id, oa.branch_id, oa.alert_type, oa.severity, oa.title, oa.message,
            oa.status, oa.assigned_to, oa.resolved_at, oa.created_at, oa.updated_at,
            oa.source_key, oa.entity_type, oa.entity_id, oa.link_path,
            oa.resolution_note, oa.resolved_by, oa.assigned_at,
            oa.escalated_at, oa.escalation_reason,
            b.name AS branch_name,
            asg.full_name AS assigned_to_name,
            res.full_name AS resolved_by_name
     FROM operational_alerts oa
     LEFT JOIN branches b ON b.id = oa.branch_id
     LEFT JOIN users asg ON asg.id = oa.assigned_to
     LEFT JOIN users res ON res.id = oa.resolved_by
     ${where}
     ${order}
     LIMIT ${lim}`,
    params
  );

  return result.rows.map((row) => ({
    ...row,
    category: categorizeAlertType(row.alert_type),
    escalated: Boolean(row.escalated_at),
  }));
}

/**
 * Create or refresh an Open alert keyed by source_key (no duplicates while Open).
 * If an Open row with the same source_key exists, updates title/message/severity/link fields.
 * After resolve, a new Open row may be created for recurrence.
 */
export async function upsertOpenOperationalAlert(pool, {
  branchId,
  alertType,
  severity = 'Warning',
  title,
  message,
  sourceKey,
  entityType = null,
  entityId = null,
  linkPath = null,
}) {
  if (branchId == null || !alertType || !title || !message) {
    throw new Error('branchId, alertType, title, and message are required.');
  }
  const sev = ALERT_SEVERITIES.includes(severity) ? severity : 'Warning';

  if (sourceKey) {
    const existing = await pool.query(
      `SELECT alert_id FROM operational_alerts
       WHERE source_key = $1 AND status = 'Open'
       LIMIT 1`,
      [sourceKey]
    );
    if (existing.rows.length) {
      const updated = await pool.query(
        `UPDATE operational_alerts
         SET alert_type = $2,
             severity = $3,
             title = $4,
             message = $5,
             entity_type = COALESCE($6, entity_type),
             entity_id = COALESCE($7, entity_id),
             link_path = COALESCE($8, link_path),
             updated_at = CURRENT_TIMESTAMP
         WHERE alert_id = $1
         RETURNING *`,
        [
          existing.rows[0].alert_id,
          alertType,
          sev,
          String(title).slice(0, 200),
          String(message),
          entityType,
          entityId,
          linkPath,
        ]
      );
      return { row: updated.rows[0], created: false };
    }
  }

  const inserted = await pool.query(
    `INSERT INTO operational_alerts (
       branch_id, alert_type, severity, title, message, status,
       source_key, entity_type, entity_id, link_path
     ) VALUES ($1, $2, $3, $4, $5, 'Open', $6, $7, $8, $9)
     RETURNING *`,
    [
      Number(branchId),
      String(alertType).slice(0, 100),
      sev,
      String(title).slice(0, 200),
      String(message),
      sourceKey || null,
      entityType,
      entityId != null ? Number(entityId) : null,
      linkPath,
    ]
  );
  return { row: inserted.rows[0], created: true };
}

/** Resolve Open alert(s) matching source_key (used when underlying condition is closed). */
export async function resolveAlertsBySourceKey(pool, sourceKey, {
  resolvedBy = null,
  resolutionNote = 'Auto-resolved: underlying condition cleared.',
} = {}) {
  if (!sourceKey) return 0;
  const result = await pool.query(
    `UPDATE operational_alerts
     SET status = 'Resolved',
         resolved_at = CURRENT_TIMESTAMP,
         resolved_by = COALESCE($2, resolved_by),
         resolution_note = COALESCE($3, resolution_note),
         updated_at = CURRENT_TIMESTAMP
     WHERE source_key = $1 AND status = 'Open'
     RETURNING alert_id`,
    [sourceKey, resolvedBy, resolutionNote]
  );
  return result.rowCount || 0;
}

export function sortAlertsForDashboard(rows) {
  return [...rows].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 9;
    const sb = SEVERITY_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}
