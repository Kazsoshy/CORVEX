export const CREDIT_INVESTIGATION_SELECT = `
  ci.ci_id,
  ci.customer_id,
  ci.branch_id,
  ci.submitted_by,
  ci.status,
  ci.purpose,
  ci.monthly_income,
  ci.business_type,
  ci.references_summary,
  ci.form_remarks,
  ci.delinquency_status,
  ci.risk_score,
  ci.leaflet_classification,
  ci.rejection_reason,
  ci.payment_history_json,
  ci.delinquency_flags_json,
  ci.created_at,
  ci.updated_at,
  c.first_name || ' ' || c.last_name AS customer_name,
  c.customer_code,
  b.name AS branch_name,
  sub.full_name AS submitted_by_name,
  apv.full_name AS approved_by_name
`;

export const CREDIT_INVESTIGATION_FROM = `
  FROM credit_investigations ci
  JOIN customers c ON c.customer_id = ci.customer_id
  JOIN branches b ON b.id = ci.branch_id
  JOIN users sub ON sub.id = ci.submitted_by
  LEFT JOIN users apv ON apv.id = ci.approved_by
`;
