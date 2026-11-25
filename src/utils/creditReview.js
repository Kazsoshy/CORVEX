export const CREDIT_REVIEW_REASONS = [
  'First installment',
  'Need higher limit',
  'Customer over limit but wants another sale',
  'Other',
];

export const CREDIT_REVIEW_FILTERS = [
  'All',
  'Needs BM',
  'Needs More Info',
  'Approved',
  'Rejected',
];

/** BM CI desk — Applications tab filters (open work). */
export const BM_CI_APPLICATION_FILTERS = [
  { value: 'Needs Decision', label: 'Needs Decision' },
  { value: 'Pending', label: 'Pending only' },
  { value: 'Revision Requested', label: 'Needs More Info' },
];

/** BM CI desk — Investigation History filters (completed). */
export const BM_CI_HISTORY_FILTERS = [
  { value: 'Completed', label: 'All completed' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
];

/** @deprecated Prefer BM_CI_APPLICATION_FILTERS / BM_CI_HISTORY_FILTERS */
export const BM_CI_STATUS_FILTERS = [
  { value: 'Pending', label: 'Needs Decision' },
  { value: 'Revision Requested', label: 'Needs More Info' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'All', label: 'All' },
];

export function displayCreditReviewStatus(status) {
  if (status === 'Pending') return 'Needs Decision';
  if (status === 'Revision Requested') return 'Needs More Info';
  if (status === 'Needs BM') return 'Needs Decision';
  return status || '—';
}

/** Manila calendar-day age (non-negative). */
export function agingDaysManila(dateValue) {
  if (!dateValue) return 0;
  const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const day = String(dateValue).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return 0;
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(parsed);
    const diff = Math.floor(
      (new Date(`${manilaToday}T12:00:00`) - new Date(`${iso}T12:00:00`)) / 86400000
    );
    return Math.max(0, diff);
  }
  const diff = Math.floor(
    (new Date(`${manilaToday}T12:00:00`) - new Date(`${day}T12:00:00`)) / 86400000
  );
  return Math.max(0, diff);
}

/** Human waiting label using Manila calendar days. */
export function waitingLabelManila(dateValue) {
  if (dateValue == null || dateValue === '') return null;
  const days = agingDaysManila(dateValue);
  if (days === 0) return 'Waiting today';
  if (days === 1) return 'Waiting 1 day';
  return `Waiting ${days} days`;
}

/**
 * Peso amount that distinguishes null/missing from genuine zero.
 * @param {*} value
 * @param {{ emptyLabel?: string }} [options]
 */
export function formatCreditAmount(value, { emptyLabel = 'Not on file' } = {}) {
  if (value == null || value === '') return emptyLabel;
  const amount = Number(value);
  if (Number.isNaN(amount)) return emptyLabel;
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** @deprecated Prefer formatCreditAmount — kept for older screens. */
export function formatMoneyOrNA(value) {
  return formatCreditAmount(value, { emptyLabel: 'Not available' });
}

export function missingInfoLabel(kind) {
  switch (kind) {
    case 'not_provided':
      return 'Not provided';
    case 'not_applicable':
      return 'Not applicable';
    case 'pending_verification':
      return 'Pending verification';
    case 'no_records':
      return 'No records available';
    case 'not_on_file':
    default:
      return 'Not on file';
  }
}

/**
 * Prefer live credit_info.credit_limit (including genuine 0) when present;
 * otherwise snapshot limit; otherwise null (Not on file — not ₱0.00).
 */
export function resolveCurrentCreditLimit({ snapshotLimit, liveLimit } = {}) {
  if (liveLimit != null && liveLimit !== '' && !Number.isNaN(Number(liveLimit))) {
    return Number(liveLimit);
  }
  if (snapshotLimit != null && snapshotLimit !== '' && !Number.isNaN(Number(snapshotLimit))) {
    return Number(snapshotLimit);
  }
  return null;
}

const FIRST_INSTALLMENT_REASONS = new Set(['First installment', 'Initial CI']);

/**
 * First installment / initial credit vs limit increase for BM decision buttons.
 * @param {{ reason?: string|null, currentLimit?: number|null, liveCreditLimit?: number|null }} review
 */
export function isFirstInstallmentApplication(review = {}) {
  const reason = String(review.reason || review.request_reason || review.purpose || '').trim();
  if (FIRST_INSTALLMENT_REASONS.has(reason)) return true;
  const limit = resolveCurrentCreditLimit({
    snapshotLimit: review.snapshotCreditLimit ?? review.currentLimit,
    liveLimit: review.liveCreditLimit ?? review.liveLimit,
  });
  return !(Number(limit) > 0);
}

/** BM-facing wording for suggestion / policy messages (no admin config instructions). */
export function sanitizeBmSuggestionMessage(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (
    lower.includes('configure om')
    || lower.includes('income policy')
    || lower.includes('operating manager policy')
    || lower.includes('system_settings')
  ) {
    return 'No reliable system limit suggestion — income or revenue evidence is incomplete. Branch Manager should set the approved limit after review.';
  }
  if (lower.includes('insufficient employment income') || lower.includes('insufficient financial information')) {
    return 'No reliable system limit suggestion — income or revenue evidence is incomplete.';
  }
  if (lower.includes('supporting evidence is required by policy')) {
    return 'Supporting evidence is incomplete, so no numeric credit suggestion is available.';
  }
  return text;
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
  const snapshotLimit = snapObj?.financial?.credit_limit;
  const liveLimitRaw = row.live_credit_limit ?? row.liveCreditLimit ?? row.live?.financial?.credit_limit;
  const requested = row.requested_credit_limit ?? row.requestedCreditLimit ?? null;
  const approved = row.approved_credit_limit ?? row.approvedCreditLimit ?? null;
  const outstanding = snapObj?.financial?.outstanding_balance;
  const liveCreditLimit = liveLimitRaw != null && liveLimitRaw !== '' && !Number.isNaN(Number(liveLimitRaw))
    ? Number(liveLimitRaw)
    : null;
  const snapshotCreditLimit = snapshotLimit != null && snapshotLimit !== '' && !Number.isNaN(Number(snapshotLimit))
    ? Number(snapshotLimit)
    : null;

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
    displayStatus: displayCreditReviewStatus(status),
    reason,
    purpose: reason,
    requestRemarks: row.request_remarks || row.form_remarks || row.formRemarks || row.requestRemarks || null,
    requestedLimit: requested != null ? Number(requested) : null,
    approvedLimit: approved != null ? Number(approved) : null,
    liveCreditLimit,
    snapshotCreditLimit,
    currentLimit: resolveCurrentCreditLimit({
      snapshotLimit: snapshotCreditLimit,
      liveLimit: liveCreditLimit,
    }),
    outstandingBalance: outstanding != null && outstanding !== '' ? Number(outstanding) : null,
    riskLevel: row.risk_level || row.riskLevel || row.leaflet_classification || snapObj?.risk?.level || null,
    riskScore: row.risk_score ?? row.riskScore ?? snapObj?.risk?.score ?? null,
    riskReasons: Array.isArray(riskReasons) ? riskReasons : [],
    rejectionReason: row.rejection_reason || row.rejectionReason || null,
    decisionRemarks: row.decision_remarks || row.decisionRemarks || null,
    snapshot: snapObj,
    live: row.live || null,
    suggestion: snapObj?.suggestion || row.live?.suggestion || null,
    monthlyIncome: row.monthly_income != null || row.monthlyIncome != null
      ? Number(row.monthly_income ?? row.monthlyIncome)
      : null,
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
