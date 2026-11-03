export const CREDIT_REVIEW_REASONS = [
  'First installment',
  'Need higher limit',
  'Customer over limit but wants another sale',
  'Other',
];

export const CREDIT_REVIEW_FILTERS = ['All', 'Needs BM', 'Approved', 'Rejected'];

export function displayCreditReviewStatus(status) {
  if (status === 'Pending' || status === 'Revision Requested') return 'Needs BM';
  return status || '—';
}

export function formatMoneyOrNA(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return 'Not available';
  const amount = Number(value);
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Normalize API / legacy CI rows into a Credit Review view model. */
export function mapCreditReviewRow(row) {
  if (!row) return null;
  const snapshot = row.snapshot || row.financial_snapshot_json || {};
  const snapObj = typeof snapshot === 'string'
    ? (() => { try { return JSON.parse(snapshot); } catch { return {}; } })()
    : snapshot;

  const riskReasons = row.risk_reasons
    || row.risk_reasons_json
    || row.delinquencyFlags
    || row.delinquency_flags_json
    || snapObj?.risk?.reasons
    || [];

  const status = row.status || 'Pending';
  const reason = row.request_reason || row.purpose || row.requestReason || null;
  const currentLimit = snapObj?.financial?.credit_limit;
  const requested = row.requested_credit_limit ?? row.requestedCreditLimit ?? null;
  const approved = row.approved_credit_limit ?? row.approvedCreditLimit ?? null;

  return {
    id: String(row.ci_id ?? row.ciId ?? row.id),
    ciId: Number(row.ci_id ?? row.ciId),
    customerId: row.customer_id ?? row.customerId,
    customerName: row.customer_name || row.customerName || snapObj?.customer?.name || '—',
    customerCode: row.customer_code || row.customerCode || snapObj?.customer?.customer_code || null,
    submittedBy: row.submitted_by_name || row.submittedBy || null,
    approvedBy: row.approved_by_name || row.approvedBy || null,
    submissionDate: row.created_at || row.submissionDate,
    updatedAt: row.updated_at || row.updatedAt || row.decided_at || row.created_at,
    decidedAt: row.decided_at || row.decidedAt || null,
    status,
    displayStatus: row.display_status || displayCreditReviewStatus(status),
    reason,
    purpose: reason,
    requestRemarks: row.request_remarks || row.form_remarks || row.formRemarks || row.requestRemarks || null,
    requestedLimit: requested != null ? Number(requested) : null,
    approvedLimit: approved != null ? Number(approved) : null,
    currentLimit: currentLimit != null ? Number(currentLimit) : null,
    riskLevel: row.risk_level || row.riskLevel || row.leaflet_classification || snapObj?.risk?.level || null,
    riskScore: row.risk_score ?? row.riskScore ?? snapObj?.risk?.score ?? null,
    riskReasons: Array.isArray(riskReasons) ? riskReasons : [],
    rejectionReason: row.rejection_reason || row.rejectionReason || null,
    decisionRemarks: row.decision_remarks || row.decisionRemarks || null,
    snapshot: snapObj,
    live: row.live || null,
    suggestion: snapObj?.suggestion || row.live?.suggestion || null,
    // legacy fields kept for older screens
    monthlyIncome: Number(row.monthly_income || row.monthlyIncome || 0),
    businessType: row.business_type || row.businessType || null,
    references: row.references_summary || row.references || null,
    formRemarks: row.form_remarks || row.formRemarks || null,
    delinquencyStatus: row.delinquency_status || row.delinquencyStatus || null,
    leafletClassification: row.leaflet_classification || row.leafletClassification || null,
    delinquencyFlags: Array.isArray(riskReasons) ? riskReasons : [],
    paymentHistory: Array.isArray(snapObj?.financial?.payment_history)
      ? snapObj.financial.payment_history
      : (Array.isArray(row.paymentHistory) ? row.paymentHistory : []),
  };
}
