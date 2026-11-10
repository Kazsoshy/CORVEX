export const CREDIT_INVESTIGATION_SELECT = `
  ci.ci_id,
  ci.customer_id,
  ci.branch_id,
  ci.submitted_by,
  ci.approved_by,
  ci.status,
  ci.purpose,
  ci.request_reason,
  ci.requested_credit_limit,
  ci.request_remarks,
  ci.monthly_income,
  ci.business_type,
  ci.references_summary,
  ci.form_remarks,
  ci.delinquency_status,
  ci.risk_score,
  ci.risk_level,
  ci.risk_reasons_json,
  ci.leaflet_classification,
  ci.rejection_reason,
  ci.decision_remarks,
  ci.approved_credit_limit,
  ci.decided_at,
  ci.financial_snapshot_json,
  ci.payment_history_json,
  ci.delinquency_flags_json,
  ci.revision_history_json,
  ci.resubmitted_at,
  ci.created_at,
  ci.updated_at,
  c.first_name || ' ' || c.last_name AS customer_name,
  c.customer_code,
  c.assigned_sales_agent_id,
  c.account_manager_id,
  c.contact_phone,
  b.name AS branch_name,
  sub.full_name AS submitted_by_name,
  apv.full_name AS approved_by_name,
  COALESCE(NULLIF(TRIM(sa.full_name), ''), TRIM(CONCAT_WS(' ', sa.first_name, sa.last_name))) AS assigned_sales_agent_name,
  COALESCE(NULLIF(TRIM(am.full_name), ''), TRIM(CONCAT_WS(' ', am.first_name, am.last_name))) AS account_manager_name,
  COALESCE(ca.outstanding_balance, 0)::float AS outstanding_balance,
  COALESCE(cci.credit_limit, 0)::float AS live_credit_limit
`;

export const CREDIT_INVESTIGATION_FROM = `
  FROM credit_investigations ci
  JOIN customers c ON c.customer_id = ci.customer_id
  JOIN branches b ON b.id = ci.branch_id
  JOIN users sub ON sub.id = ci.submitted_by
  LEFT JOIN users apv ON apv.id = ci.approved_by
  LEFT JOIN users sa ON sa.id = c.assigned_sales_agent_id
  LEFT JOIN users am ON am.id = c.account_manager_id
  LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
  LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
`;
