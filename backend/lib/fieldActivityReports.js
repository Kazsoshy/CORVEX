/**
 * Shared Field Activity Report constants and SQL helpers.
 * Sales = assignment + work_date; Collector = visit + scheduled_date.
 */

export const SALES_ACTIVITY_TYPES = [
  'Canvassing',
  'Follow-up',
  'Site Check',
  'No Prospects Found',
];

export const COLLECTOR_NORMAL_ACTIVITIES = [
  'Collection',
  'Partial Collection',
  'Promise to Pay',
  'Customer Not Available',
  'Follow-up',
];

export const COLLECTOR_INCIDENT_ACTIVITIES = [
  'Payment Dispute',
  'Customer Refused',
  'Safety / Aggression',
  'Location Issue',
];

export const COLLECTOR_ACTIVITY_TYPES = [
  ...COLLECTOR_NORMAL_ACTIVITIES,
  ...COLLECTOR_INCIDENT_ACTIVITIES,
];

export const COLLECTOR_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const BM_SEVERITY_FILTERS = ['High', 'Critical'];

const INCIDENT_SET = new Set(COLLECTOR_INCIDENT_ACTIVITIES);

export function isCollectorIncidentActivity(activityType) {
  return INCIDENT_SET.has(String(activityType || '').trim());
}

/** Operational work date: sales assignment work_date, else collector visit scheduled_date. */
export const FAR_WORK_DATE_SQL = `COALESCE(saa.work_date, fv.scheduled_date)`;

export const FAR_FROM_SQL = `
  FROM field_activity_reports far
  LEFT JOIN field_visits fv ON fv.visit_id = far.visit_id
  LEFT JOIN customers visit_c ON visit_c.customer_id = fv.customer_id
  LEFT JOIN customers linked_c ON linked_c.customer_id = far.customer_id
  LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far.assignment_id
  JOIN users u ON u.id = far.user_id
  JOIN roles r ON r.role_id = u.role_id AND r.slug IN ('collector', 'sales_staff')
  LEFT JOIN branches b ON b.id = COALESCE(saa.branch_id, visit_c.branch_id, linked_c.branch_id, u.branch_id)
`;

export const FAR_SELECT_COLUMNS = `
  far.report_id,
  far.visit_id,
  far.assignment_id,
  far.customer_id AS report_customer_id,
  far.user_id AS staff_id,
  far.activity_type,
  far.severity,
  far.remarks,
  far.sync_status,
  far.created_at,
  (far.photo IS NOT NULL AND far.photo <> '') AS has_photo,
  ${FAR_WORK_DATE_SQL} AS work_date,
  fv.scheduled_date AS visit_scheduled_date,
  fv.visit_type,
  fv.status AS visit_status,
  saa.area_name,
  saa.work_date AS assignment_work_date,
  saa.status AS assignment_status,
  COALESCE(
    NULLIF(CONCAT_WS(' ', linked_c.first_name, linked_c.last_name), ''),
    NULLIF(CONCAT_WS(' ', visit_c.first_name, visit_c.last_name), ''),
    NULL
  ) AS customer_name,
  COALESCE(linked_c.customer_code, visit_c.customer_code) AS customer_code,
  COALESCE(far.customer_id, visit_c.customer_id, linked_c.customer_id) AS customer_id,
  CONCAT_WS(' ', u.first_name, u.last_name) AS staff_name,
  u.id AS staff_user_id,
  r.slug AS staff_role_slug,
  CASE r.slug WHEN 'sales_staff' THEN 'Sales Agent' ELSE 'Collector' END AS staff_role,
  b.name AS branch_name,
  b.id AS branch_id
`;

export function mapFarRow(row, { includePhoto = false } = {}) {
  const mapped = {
    report_id: row.report_id,
    visit_id: row.visit_id ?? null,
    assignment_id: row.assignment_id ?? null,
    customer_id: row.customer_id ?? null,
    customer_code: row.customer_code || null,
    customer_name: row.customer_name || null,
    staff_id: row.staff_id ?? row.staff_user_id ?? null,
    staff_name: row.staff_name || null,
    staff_role: row.staff_role || null,
    staff_role_slug: row.staff_role_slug || null,
    // Compatibility aliases for older UI consumers
    collector_id: row.staff_id ?? row.staff_user_id ?? null,
    collector_name: row.staff_name || null,
    area_name: row.area_name || null,
    work_date: row.work_date || null,
    scheduled_date: row.work_date || row.visit_scheduled_date || null,
    visit_scheduled_date: row.visit_scheduled_date || null,
    assignment_work_date: row.assignment_work_date || null,
    visit_type: row.visit_type || null,
    visit_status: row.visit_status || null,
    assignment_status: row.assignment_status || null,
    activity_type: row.activity_type || null,
    severity: row.severity || null,
    remarks: row.remarks || null,
    has_photo: Boolean(row.has_photo),
    sync_status: row.sync_status || null,
    created_at: row.created_at || null,
    branch_name: row.branch_name || null,
    branch_id: row.branch_id ?? null,
  };
  if (includePhoto) mapped.photo = row.photo || null;
  return mapped;
}
