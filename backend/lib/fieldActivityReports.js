/**
 * Shared Field Activity Report constants and SQL helpers.
 * Sales = assignment + work_date; Collector = visit + scheduled_date.
 */

/** Legacy mid-day activity types (historical rows only; do not rewrite). */
export const SALES_LEGACY_ACTIVITY_TYPES = [
  'Canvassing',
  'Follow-up',
  'Site Check',
  'No Prospects Found',
];

/** Overall assignment outcomes for consolidated SA FARs. */
export const SALES_ASSIGNMENT_OUTCOMES = [
  'Canvassing Completed – Prospects Identified',
  'Canvassing Completed – No Interested Prospects',
  'Follow-up Required',
  'Partially Completed',
  'Unable to Complete',
];

/** Accept new outcomes; keep legacy for display/filters of historical rows. */
export const SALES_ACTIVITY_TYPES = [
  ...SALES_ASSIGNMENT_OUTCOMES,
  ...SALES_LEGACY_ACTIVITY_TYPES,
];

export const FAR_REVIEW_STATUSES = ['Submitted', 'Reviewed', 'Needs Follow-up'];

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
const OUTCOME_SET = new Set(SALES_ASSIGNMENT_OUTCOMES);

export function isCollectorIncidentActivity(activityType) {
  return INCIDENT_SET.has(String(activityType || '').trim());
}

export function isSalesAssignmentOutcome(activityType) {
  return OUTCOME_SET.has(String(activityType || '').trim());
}

export function isValidSalesFarOutcome(activityType) {
  return SALES_ACTIVITY_TYPES.includes(String(activityType || '').trim());
}

/**
 * FAR edit deadline = end of coverage day COALESCE(end_date, work_date) 23:59:59 Asia/Manila.
 * Returns a Date, or null if coverage date missing.
 */
export function farEditableUntilDate(workDate, endDate = null) {
  const day = String(endDate || workDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // Construct as Manila local midnight of next day, then subtract 1ms via ISO with +08:00.
  return new Date(`${day}T23:59:59.999+08:00`);
}

export function isFarEditableNow({
  workDate,
  endDate = null,
  editReopenedUntil = null,
  now = new Date(),
} = {}) {
  if (editReopenedUntil) {
    const reopen = new Date(editReopenedUntil);
    if (Number.isFinite(reopen.getTime()) && reopen.getTime() > now.getTime()) return true;
  }
  const until = farEditableUntilDate(workDate, endDate);
  if (!until) return false;
  return now.getTime() <= until.getTime();
}

export function hasFarPhotoEvidence(photo, photoExceptionReason) {
  const photoOk = typeof photo === 'string' && photo.trim().startsWith('data:image/') && photo.trim().length > 0;
  const exceptionOk = Boolean(String(photoExceptionReason || '').trim());
  return photoOk || exceptionOk;
}

export function validateSalesFarEvidence({ photo, photoExceptionReason }) {
  const photoValue = typeof photo === 'string' ? photo.trim() : '';
  const exception = String(photoExceptionReason || '').trim();
  if (photoValue) {
    if (!photoValue.startsWith('data:image/')) {
      return { ok: false, message: 'photo must be a valid image upload.' };
    }
    if (photoValue.length > 900_000) {
      return { ok: false, message: 'photo is too large. Use a smaller image.' };
    }
    return { ok: true, photo: photoValue, photoExceptionReason: exception || null };
  }
  if (exception) {
    return { ok: true, photo: null, photoExceptionReason: exception.slice(0, 1000) };
  }
  return {
    ok: false,
    message: 'Photo evidence is required, or provide a photo exception reason.',
  };
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
  far.updated_at,
  far.updated_by,
  far.review_status,
  far.reviewed_at,
  far.reviewed_by,
  far.review_notes,
  far.photo_exception_reason,
  far.is_superseded,
  far.superseded_by,
  far.edit_reopened_until,
  far.revision_history_json,
  (far.photo IS NOT NULL AND far.photo <> '') AS has_photo,
  ${FAR_WORK_DATE_SQL} AS work_date,
  fv.scheduled_date AS visit_scheduled_date,
  fv.visit_type,
  fv.status AS visit_status,
  saa.area_name,
  saa.work_date AS assignment_work_date,
  saa.end_date AS assignment_end_date,
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
    collector_id: row.staff_id ?? row.staff_user_id ?? null,
    collector_name: row.staff_name || null,
    area_name: row.area_name || null,
    work_date: row.work_date || null,
    scheduled_date: row.work_date || row.visit_scheduled_date || null,
    visit_scheduled_date: row.visit_scheduled_date || null,
    assignment_work_date: row.assignment_work_date || null,
    assignment_end_date: row.assignment_end_date || null,
    visit_type: row.visit_type || null,
    visit_status: row.visit_status || null,
    assignment_status: row.assignment_status || null,
    activity_type: row.activity_type || null,
    overall_outcome: row.activity_type || null,
    severity: row.severity || null,
    remarks: row.remarks || null,
    has_photo: Boolean(row.has_photo),
    photo_exception_reason: row.photo_exception_reason || null,
    sync_status: row.sync_status || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    updated_by: row.updated_by ?? null,
    review_status: row.review_status || 'Submitted',
    reviewed_at: row.reviewed_at || null,
    reviewed_by: row.reviewed_by ?? null,
    review_notes: row.review_notes || null,
    is_superseded: Boolean(row.is_superseded),
    superseded_by: row.superseded_by ?? null,
    edit_reopened_until: row.edit_reopened_until || null,
    revision_history: Array.isArray(row.revision_history_json)
      ? row.revision_history_json
      : (typeof row.revision_history_json === 'string'
        ? (() => { try { return JSON.parse(row.revision_history_json); } catch { return []; } })()
        : []),
    editable: isFarEditableNow({
      workDate: row.assignment_work_date || row.work_date,
      endDate: row.assignment_end_date,
      editReopenedUntil: row.edit_reopened_until,
    }),
    is_legacy_activity: !isSalesAssignmentOutcome(row.activity_type)
      && SALES_LEGACY_ACTIVITY_TYPES.includes(String(row.activity_type || '').trim()),
    branch_name: row.branch_name || null,
    branch_id: row.branch_id ?? null,
  };
  if (includePhoto) mapped.photo = row.photo || null;
  return mapped;
}

export function buildFarRevisionSnapshot(row, editedBy) {
  return {
    at: new Date().toISOString(),
    edited_by: editedBy || null,
    activity_type: row.activity_type || null,
    remarks: row.remarks || null,
    has_photo: Boolean(row.photo),
    photo_exception_reason: row.photo_exception_reason || null,
    review_status: row.review_status || 'Submitted',
  };
}
