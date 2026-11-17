import { manilaDateString } from './sawCollection.js';
import { insertUserNotification } from './creditInvestigationNotifications.js';

export const AREA_ASSIGNMENT_STATUSES = new Set([
  'Assigned',
  'In Progress',
  'Done',
  'Not Started',
  'Incomplete',
]);
export const AREA_ASSIGNMENT_ACTIVE_STATUSES = ['Assigned', 'In Progress', 'Done'];
export const AREA_ASSIGNMENT_TERMINAL_STATUSES = new Set(['Done', 'Not Started', 'Incomplete']);
export const AREA_ASSIGNMENT_AUTO_CLOSED = new Set(['Not Started', 'Incomplete']);

export const AREA_ASSIGNMENT_SELECT = `
  saa.assignment_id,
  saa.branch_id,
  b.name AS branch_name,
  saa.sales_agent_id,
  TRIM(CONCAT_WS(' ', agent.first_name, agent.last_name)) AS sales_agent_name,
  agent.employee_id AS sales_agent_employee_id,
  saa.assigned_by,
  TRIM(CONCAT_WS(' ', assigner.first_name, assigner.last_name)) AS assigned_by_name,
  saa.territory_id,
  t.territory_name,
  saa.area_name,
  saa.coverage_notes,
  saa.work_date::text AS work_date,
  COALESCE(saa.end_date, saa.work_date)::text AS end_date,
  saa.status,
  saa.latitude,
  saa.longitude,
  saa.radius_meters,
  saa.started_at,
  saa.completed_at,
  saa.closure_notes,
  saa.closeout_report_id,
  saa.created_at,
  saa.updated_at
`;

export const AREA_ASSIGNMENT_FROM = `
  FROM sales_area_assignments saa
  JOIN branches b ON b.id = saa.branch_id
  JOIN users agent ON agent.id = saa.sales_agent_id
  LEFT JOIN users assigner ON assigner.id = saa.assigned_by
  LEFT JOIN territories t ON t.territory_id = saa.territory_id
`;

/** True when asOfDate falls inside inclusive [work_date, end_date]. */
export const COVERS_DATE_SQL = `(
  saa.work_date <= $DATE::date
  AND COALESCE(saa.end_date, saa.work_date) >= $DATE::date
)`;

export function coversDateSql(paramIndex) {
  return `(
    saa.work_date <= $${paramIndex}::date
    AND COALESCE(saa.end_date, saa.work_date) >= $${paramIndex}::date
  )`;
}

export function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isValidDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

export function rangesOverlap(startA, endA, startB, endB) {
  return String(startA) <= String(endB) && String(startB) <= String(endA);
}

/**
 * Auto-close stale open assignments after Manila calendar day past end_date.
 * Assigned → Not Started; In Progress → Incomplete (completed_at = close time).
 * Notifies branch managers when rows become Incomplete.
 */
export async function autoCloseStaleAssignments(pool, { branchId = null, salesAgentId = null } = {}) {
  const today = manilaDateString();
  const params = [today];
  const where = [
    `status IN ('Assigned', 'In Progress')`,
    `COALESCE(end_date, work_date) < $1::date`,
  ];
  if (branchId != null) {
    params.push(branchId);
    where.push(`branch_id = $${params.length}`);
  }
  if (salesAgentId != null) {
    params.push(salesAgentId);
    where.push(`sales_agent_id = $${params.length}`);
  }

  const notStarted = await pool.query(
    `UPDATE sales_area_assignments
     SET status = 'Not Started',
         updated_at = CURRENT_TIMESTAMP
     WHERE ${where.join(' AND ')}
       AND status = 'Assigned'
     RETURNING assignment_id, branch_id, sales_agent_id, area_name,
               work_date::text AS work_date,
               COALESCE(end_date, work_date)::text AS end_date`,
    params
  );

  const incomplete = await pool.query(
    `UPDATE sales_area_assignments
     SET status = 'Incomplete',
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE ${where.join(' AND ')}
       AND status = 'In Progress'
     RETURNING assignment_id, branch_id, sales_agent_id, area_name,
               work_date::text AS work_date,
               COALESCE(end_date, work_date)::text AS end_date`,
    params
  );

  if (incomplete.rows.length) {
    await notifyIncompleteAssignments(pool, incomplete.rows);
  }

  return {
    notStarted: notStarted.rowCount || 0,
    incomplete: incomplete.rowCount || 0,
    notStartedRows: notStarted.rows,
    incompleteRows: incomplete.rows,
  };
}

/** @deprecated Prefer autoCloseStaleAssignments; kept for call-site compatibility. */
export async function expireStaleAssignments(pool, opts = {}) {
  const result = await autoCloseStaleAssignments(pool, opts);
  return (result.notStarted || 0) + (result.incomplete || 0);
}

async function notifyIncompleteAssignments(pool, rows) {
  const byBranch = new Map();
  for (const row of rows || []) {
    const bid = Number(row.branch_id);
    if (!Number.isInteger(bid) || bid <= 0) continue;
    if (!byBranch.has(bid)) byBranch.set(bid, []);
    byBranch.get(bid).push(row);
  }

  for (const [branchId, items] of byBranch.entries()) {
    const managers = await pool.query(
      `SELECT u.id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.status = 'Active'
         AND u.branch_id = $1
         AND r.slug = 'branch_manager'`,
      [branchId]
    );
    if (!managers.rows.length) continue;

    const names = items
      .map((row) => String(row.area_name || `Assignment #${row.assignment_id}`).trim())
      .filter(Boolean)
      .slice(0, 6);
    const more = items.length > names.length ? ` and ${items.length - names.length} more` : '';
    const title = items.length === 1
      ? 'Sales area incomplete'
      : `${items.length} sales areas incomplete`;
    const message = items.length === 1
      ? `${names[0]} closed as Incomplete after end date — needs attention (extend or reassign).`
      : `${names.join(', ')}${more} closed as Incomplete after end date — needs attention.`;

    await Promise.all(managers.rows.map((mgr) => insertUserNotification(pool, {
      userId: mgr.id,
      title,
      message,
      category: 'Schedule',
    })));
  }
}

/**
 * Customers in assignment coverage: matching territory_id OR within radius of pin.
 * Does not change ownership.
 */
export async function discoverAreaCustomers(pool, assignment, salesAgentId) {
  if (!assignment) return [];
  const branchId = Number(assignment.branch_id);
  const territoryId = assignment.territory_id != null ? Number(assignment.territory_id) : null;
  const lat = Number(assignment.latitude);
  const lng = Number(assignment.longitude);
  const radius = Math.max(100, Number(assignment.radius_meters) || 800);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const agentId = Number(salesAgentId) || Number(assignment.sales_agent_id) || null;

  const result = await pool.query(
    `SELECT
       c.customer_id,
       c.customer_code,
       COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
       c.contact_phone,
       c.status,
       c.territory_id,
       t.territory_name,
       c.assigned_sales_agent_id,
       c.branch_id,
       c.latitude::float AS latitude,
       c.longitude::float AS longitude,
       CASE
         WHEN c.latitude IS NULL OR c.longitude IS NULL THEN TRUE
         WHEN c.latitude = 0 AND c.longitude = 0 THEN TRUE
         ELSE FALSE
       END AS missing_coords,
       CASE
         WHEN $5::int IS NOT NULL AND c.assigned_sales_agent_id = $5::int THEN TRUE
         ELSE FALSE
       END AS in_book,
       CASE WHEN c.branch_id = $1::int THEN TRUE ELSE FALSE END AS same_branch,
       CASE
         WHEN $2::int IS NOT NULL AND c.territory_id = $2::int THEN TRUE
         ELSE FALSE
       END AS territory_match,
       CASE
         WHEN $6::boolean
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND NOT (c.latitude = 0 AND c.longitude = 0)
         THEN (
           6371000 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS((c.latitude::float - $3::float) / 2)), 2)
             + COS(RADIANS($3::float)) * COS(RADIANS(c.latitude::float))
               * POWER(SIN(RADIANS((c.longitude::float - $4::float) / 2)), 2)
           ))
         )
         ELSE NULL
       END AS distance_meters
     FROM customers c
     LEFT JOIN territories t ON t.territory_id = c.territory_id
     WHERE c.branch_id = $1::int
       AND COALESCE(c.status, 'Active') <> 'Deleted'
       AND (
         ($2::int IS NOT NULL AND c.territory_id = $2::int)
         OR (
           $6::boolean
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND NOT (c.latitude = 0 AND c.longitude = 0)
           AND (
             6371000 * 2 * ASIN(SQRT(
               POWER(SIN(RADIANS((c.latitude::float - $3::float) / 2)), 2)
               + COS(RADIANS($3::float)) * COS(RADIANS(c.latitude::float))
                 * POWER(SIN(RADIANS((c.longitude::float - $4::float) / 2)), 2)
             ))
           ) <= $7::float
         )
       )
     ORDER BY
       CASE WHEN $5::int IS NOT NULL AND c.assigned_sales_agent_id = $5::int THEN 0 ELSE 1 END,
       distance_meters NULLS LAST,
       customer_name ASC
     LIMIT 500`,
    [branchId, territoryId, hasPin ? lat : 0, hasPin ? lng : 0, agentId, hasPin, radius]
  );

  return result.rows.map((row) => ({
    ...row,
    distance_meters: row.distance_meters != null ? Math.round(Number(row.distance_meters)) : null,
  }));
}

export async function loadAssignmentProducts(pool, assignmentIds) {
  const ids = (assignmentIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return new Map();

  const result = await pool.query(
    `SELECT sap.assignment_id, p.id AS product_id, p.name AS product_name, p.sku
     FROM sales_area_assignment_products sap
     JOIN products p ON p.id = sap.product_id
     WHERE sap.assignment_id = ANY($1::int[])
     ORDER BY p.name`,
    [ids]
  );

  const map = new Map();
  for (const row of result.rows) {
    const list = map.get(row.assignment_id) || [];
    list.push({
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
    });
    map.set(row.assignment_id, list);
  }
  return map;
}

export function withProducts(row, productsByAssignment) {
  if (!row) return null;
  return {
    ...row,
    products_to_push: productsByAssignment.get(row.assignment_id) || [],
  };
}

export async function fetchAssignmentOutcomeStats(pool, salesAgentId, workDate, {
  endDate = null,
  assignmentId = null,
} = {}) {
  if (!salesAgentId || !workDate) {
    return {
      sales_logged: 0,
      new_customers: 0,
      field_reports: 0,
      far_submitted: false,
      canonical_far: null,
      credit_investigations: 0,
      sales: [],
      customers: [],
      field_reports_list: [],
      credit_investigations_list: [],
    };
  }

  const rangeEnd = endDate || workDate;
  const reportParams = assignmentId
    ? [salesAgentId, workDate, assignmentId, rangeEnd]
    : [salesAgentId, workDate, rangeEnd];
  const reportDateSql = assignmentId
    ? `(
         far.assignment_id = $3::int
         OR (
           (far.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date
           AND (far.created_at AT TIME ZONE 'Asia/Manila')::date <= $4::date
         )
       )`
    : `(
         (saa.work_date <= $2::date AND COALESCE(saa.end_date, saa.work_date) >= $2::date)
         OR (
           (far.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date
           AND (far.created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date
         )
       )`;

  const [salesCount, customerCount, reportCount, ciCount, sales, customers, reports, cis] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM sales_invoices
       WHERE sales_agent_id = $1
         AND invoices_date >= $2::date
         AND invoices_date <= $3::date
         AND status IN ('Pending Review', 'Confirmed', 'Cancelled')`,
      [salesAgentId, workDate, rangeEnd]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM customers
       WHERE assigned_sales_agent_id = $1
         AND (created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date
         AND (created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date`,
      [salesAgentId, workDate, rangeEnd]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM field_activity_reports far
       LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far.assignment_id
       WHERE far.user_id = $1
         AND COALESCE(far.is_superseded, FALSE) = FALSE
         AND ${reportDateSql}`,
      reportParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM credit_investigations
       WHERE submitted_by = $1
         AND (created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date
         AND (created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date`,
      [salesAgentId, workDate, rangeEnd]
    ),
    pool.query(
      `SELECT
         si.sales_invoices_id,
         si.invoice_number,
         si.total_amount,
         si.status,
         si.invoices_date::text AS invoices_date,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
         c.customer_id
       FROM sales_invoices si
       LEFT JOIN customers c ON c.customer_id = si.customer_id
       WHERE si.sales_agent_id = $1
         AND si.invoices_date >= $2::date
         AND si.invoices_date <= $3::date
         AND si.status IN ('Pending Review', 'Confirmed', 'Cancelled')
       ORDER BY si.created_at DESC
       LIMIT 25`,
      [salesAgentId, workDate, rangeEnd]
    ),
    pool.query(
      `SELECT
         c.customer_id,
         c.customer_code,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
         c.contact_phone,
         c.status,
         c.created_at
       FROM customers c
       WHERE c.assigned_sales_agent_id = $1
         AND (c.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date
         AND (c.created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date
       ORDER BY c.created_at DESC
       LIMIT 25`,
      [salesAgentId, workDate, rangeEnd]
    ),
    pool.query(
      `SELECT
         far.report_id,
         far.activity_type,
         far.remarks,
         far.sync_status,
         far.created_at,
         far.updated_at,
         far.review_status,
         far.is_superseded,
         far.assignment_id,
         (far.photo IS NOT NULL AND far.photo <> '') AS has_photo,
         far.photo_exception_reason,
         COALESCE(
           NULLIF(CONCAT_WS(' ', linked.first_name, linked.last_name), ''),
           NULLIF(CONCAT_WS(' ', visit_c.first_name, visit_c.last_name), ''),
           NULL
         ) AS customer_name,
         saa.area_name
       FROM field_activity_reports far
       LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far.assignment_id
       LEFT JOIN field_visits fv ON fv.visit_id = far.visit_id
       LEFT JOIN customers visit_c ON visit_c.customer_id = fv.customer_id
       LEFT JOIN customers linked ON linked.customer_id = far.customer_id
       WHERE far.user_id = $1
         AND ${reportDateSql}
       ORDER BY COALESCE(far.is_superseded, FALSE) ASC, far.created_at DESC
       LIMIT 50`,
      reportParams
    ),
    pool.query(
      `SELECT
         ci.ci_id,
         ci.purpose,
         ci.status,
         ci.created_at,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
         c.customer_id
       FROM credit_investigations ci
       JOIN customers c ON c.customer_id = ci.customer_id
       WHERE ci.submitted_by = $1
         AND (ci.created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date
         AND (ci.created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date
       ORDER BY ci.created_at DESC
       LIMIT 25`,
      [salesAgentId, workDate, rangeEnd]
    ),
  ]);

  const reportRows = reports.rows;
  const canonicalFar = assignmentId
    ? (reportRows.find((r) => !r.is_superseded && Number(r.assignment_id) === Number(assignmentId)) || null)
    : (reportRows.find((r) => !r.is_superseded) || null);

  return {
    sales_logged: salesCount.rows[0]?.count || 0,
    new_customers: customerCount.rows[0]?.count || 0,
    field_reports: reportCount.rows[0]?.count || 0,
    far_submitted: Boolean(canonicalFar),
    canonical_far: canonicalFar,
    credit_investigations: ciCount.rows[0]?.count || 0,
    sales: sales.rows,
    customers: customers.rows,
    field_reports_list: reportRows,
    credit_investigations_list: cis.rows,
  };
}

export function resolveScopeDates(scope, today = manilaDateString()) {
  const normalized = String(scope || 'today').toLowerCase();
  if (normalized === 'upcoming') {
    return {
      scope: 'upcoming',
      today,
      dateSql: 'saa.work_date > $2::date',
      needsToday: true,
    };
  }
  if (normalized === 'history') {
    return {
      scope: 'history',
      today,
      dateSql: 'COALESCE(saa.end_date, saa.work_date) < $2::date',
      needsToday: true,
    };
  }
  return {
    scope: 'today',
    today,
    dateSql: '(saa.work_date <= $2::date AND COALESCE(saa.end_date, saa.work_date) >= $2::date)',
    needsToday: true,
  };
}

/** Normalize area names for duplicate detection (case/spacing insensitive). */
export function normalizeAreaName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Find conflicting area assignments for an overlapping date range.
 * Blocks overlapping territory / same agent+area name among Assigned|In Progress|Done.
 * Not Started / Incomplete do not block.
 */
export async function findAreaAssignmentConflicts(pool, {
  branchId,
  salesAgentId,
  workDate,
  endDate = null,
  territoryId = null,
  areaName = '',
  latitude = null,
  longitude = null,
  radiusMeters = 800,
  excludeAssignmentId = null,
}) {
  const conflicts = [];
  const warnings = [];
  const normalizedName = normalizeAreaName(areaName);
  const rangeStart = String(workDate).slice(0, 10);
  const rangeEnd = String(endDate || workDate).slice(0, 10);

  const existing = await pool.query(
    `SELECT saa.assignment_id, saa.sales_agent_id, saa.territory_id, saa.area_name,
            saa.status, saa.latitude, saa.longitude, saa.radius_meters,
            saa.work_date::text AS work_date,
            COALESCE(saa.end_date, saa.work_date)::text AS end_date,
            TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS sales_agent_name
     FROM sales_area_assignments saa
     JOIN users u ON u.id = saa.sales_agent_id
     WHERE saa.branch_id = $1
       AND saa.status IN ('Assigned', 'In Progress', 'Done')
       AND saa.work_date <= $3::date
       AND COALESCE(saa.end_date, saa.work_date) >= $2::date
       AND ($4::int IS NULL OR saa.assignment_id <> $4::int)`,
    [branchId, rangeStart, rangeEnd, excludeAssignmentId]
  );

  for (const row of existing.rows) {
    const sameAgent = Number(row.sales_agent_id) === Number(salesAgentId);
    const sameTerritory = territoryId != null
      && row.territory_id != null
      && Number(row.territory_id) === Number(territoryId);
    const sameAreaName = normalizedName
      && normalizeAreaName(row.area_name) === normalizedName;
    const windowLabel = row.work_date === row.end_date
      ? row.work_date
      : `${row.work_date}–${row.end_date}`;

    if (sameAgent && sameTerritory) {
      conflicts.push({
        code: 'same_agent_same_territory',
        message: `This agent already has territory coverage overlapping ${rangeStart}${rangeEnd !== rangeStart ? `–${rangeEnd}` : ''} (${windowLabel}).`,
        assignment: row,
      });
      continue;
    }
    if (sameAgent && sameAreaName) {
      conflicts.push({
        code: 'same_agent_same_area_name',
        message: `This agent already has an assignment named "${row.area_name}" overlapping ${windowLabel}.`,
        assignment: row,
      });
      continue;
    }
    if (!sameAgent && sameTerritory) {
      conflicts.push({
        code: 'other_agent_same_territory',
        message: `${row.sales_agent_name || 'Another agent'} already covers this territory overlapping ${windowLabel}.`,
        assignment: row,
      });
      continue;
    }

    const hasCoords = Number.isFinite(Number(latitude))
      && Number.isFinite(Number(longitude))
      && Number.isFinite(Number(row.latitude))
      && Number.isFinite(Number(row.longitude));
    if (hasCoords) {
      const distance = haversineMeters(latitude, longitude, row.latitude, row.longitude);
      const combined = (Number(radiusMeters) || 800) + (Number(row.radius_meters) || 800);
      if (distance < combined) {
        warnings.push({
          code: 'possible_spatial_overlap',
          message: `Coverage may overlap ${row.sales_agent_name || 'another assignment'} (~${Math.round(distance)} m apart).`,
          assignment: row,
          distance_meters: Math.round(distance),
        });
      }
    }
  }

  return { conflicts, warnings };
}
