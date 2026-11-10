import { manilaDateString } from './sawCollection.js';

export const AREA_ASSIGNMENT_STATUSES = new Set(['Assigned', 'In Progress', 'Done']);

export const AREA_ASSIGNMENT_SELECT = `
  saa.assignment_id,
  saa.branch_id,
  b.name AS branch_name,
  saa.sales_agent_id,
  TRIM(CONCAT_WS(' ', agent.first_name, agent.last_name)) AS sales_agent_name,
  saa.assigned_by,
  TRIM(CONCAT_WS(' ', assigner.first_name, assigner.last_name)) AS assigned_by_name,
  saa.territory_id,
  t.territory_name,
  saa.area_name,
  saa.coverage_notes,
  saa.work_date::text AS work_date,
  saa.status,
  saa.latitude,
  saa.longitude,
  saa.radius_meters,
  saa.started_at,
  saa.completed_at,
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

export function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isValidDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00`));
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

export async function fetchAssignmentOutcomeStats(pool, salesAgentId, workDate) {
  if (!salesAgentId || !workDate) {
    return {
      sales_logged: 0,
      new_customers: 0,
      field_reports: 0,
      credit_investigations: 0,
      sales: [],
      customers: [],
      field_reports_list: [],
      credit_investigations_list: [],
    };
  }

  const [salesCount, customerCount, reportCount, ciCount, sales, customers, reports, cis] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM sales_invoices
       WHERE sales_agent_id = $1
         AND invoices_date = $2::date
         AND status IN ('Pending Review', 'Confirmed', 'Cancelled')`,
      [salesAgentId, workDate]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM customers
       WHERE assigned_sales_agent_id = $1
         AND (created_at AT TIME ZONE 'Asia/Manila')::date = $2::date`,
      [salesAgentId, workDate]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM field_activity_reports far
       LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far.assignment_id
       WHERE far.user_id = $1
         AND (
           saa.work_date = $2::date
           OR (far.created_at AT TIME ZONE 'Asia/Manila')::date = $2::date
         )`,
      [salesAgentId, workDate]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM credit_investigations
       WHERE submitted_by = $1
         AND (created_at AT TIME ZONE 'Asia/Manila')::date = $2::date`,
      [salesAgentId, workDate]
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
         AND si.invoices_date = $2::date
         AND si.status IN ('Pending Review', 'Confirmed', 'Cancelled')
       ORDER BY si.created_at DESC
       LIMIT 25`,
      [salesAgentId, workDate]
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
         AND (c.created_at AT TIME ZONE 'Asia/Manila')::date = $2::date
       ORDER BY c.created_at DESC
       LIMIT 25`,
      [salesAgentId, workDate]
    ),
    pool.query(
      `SELECT
         far.report_id,
         far.activity_type,
         far.remarks,
         far.sync_status,
         far.created_at,
         far.assignment_id,
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
         AND (
           saa.work_date = $2::date
           OR (far.created_at AT TIME ZONE 'Asia/Manila')::date = $2::date
         )
       ORDER BY far.created_at DESC
       LIMIT 25`,
      [salesAgentId, workDate]
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
         AND (ci.created_at AT TIME ZONE 'Asia/Manila')::date = $2::date
       ORDER BY ci.created_at DESC
       LIMIT 25`,
      [salesAgentId, workDate]
    ),
  ]);

  return {
    sales_logged: salesCount.rows[0]?.count || 0,
    new_customers: customerCount.rows[0]?.count || 0,
    field_reports: reportCount.rows[0]?.count || 0,
    credit_investigations: ciCount.rows[0]?.count || 0,
    sales: sales.rows,
    customers: customers.rows,
    field_reports_list: reports.rows,
    credit_investigations_list: cis.rows,
  };
}

export function resolveScopeDates(scope, today = manilaDateString()) {
  const normalized = String(scope || 'today').toLowerCase();
  if (normalized === 'upcoming') {
    return { scope: 'upcoming', today, dateSql: 'saa.work_date > $2::date', needsToday: true };
  }
  if (normalized === 'history') {
    return { scope: 'history', today, dateSql: 'saa.work_date < $2::date', needsToday: true };
  }
  return { scope: 'today', today, dateSql: 'saa.work_date = $2::date', needsToday: true };
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
 * Find conflicting area assignments for the same work date.
 * Blocks:
 * - same agent + same territory
 * - same agent + same normalized area name
 * - different agents + same territory
 * Warns (does not block alone):
 * - pin/radius circles that likely overlap when both have coordinates
 */
export async function findAreaAssignmentConflicts(pool, {
  branchId,
  salesAgentId,
  workDate,
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

  const existing = await pool.query(
    `SELECT saa.assignment_id, saa.sales_agent_id, saa.territory_id, saa.area_name,
            saa.status, saa.latitude, saa.longitude, saa.radius_meters,
            TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS sales_agent_name
     FROM sales_area_assignments saa
     JOIN users u ON u.id = saa.sales_agent_id
     WHERE saa.branch_id = $1
       AND saa.work_date = $2::date
       AND saa.status IN ('Assigned', 'In Progress', 'Done')
       AND ($3::int IS NULL OR saa.assignment_id <> $3::int)`,
    [branchId, workDate, excludeAssignmentId]
  );

  for (const row of existing.rows) {
    const sameAgent = Number(row.sales_agent_id) === Number(salesAgentId);
    const sameTerritory = territoryId != null
      && row.territory_id != null
      && Number(row.territory_id) === Number(territoryId);
    const sameAreaName = normalizedName
      && normalizeAreaName(row.area_name) === normalizedName;

    if (sameAgent && sameTerritory) {
      conflicts.push({
        code: 'same_agent_same_territory',
        message: `This agent already has territory coverage for ${workDate}.`,
        assignment: row,
      });
      continue;
    }
    if (sameAgent && sameAreaName) {
      conflicts.push({
        code: 'same_agent_same_area_name',
        message: `This agent already has an assignment named "${row.area_name}" for ${workDate}.`,
        assignment: row,
      });
      continue;
    }
    if (!sameAgent && sameTerritory) {
      conflicts.push({
        code: 'other_agent_same_territory',
        message: `${row.sales_agent_name || 'Another agent'} already covers this territory on ${workDate}.`,
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
