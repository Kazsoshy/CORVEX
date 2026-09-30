import apiClient from './apiClient.js';

export async function fetchCreditInvestigations(params = {}) {
  try {
    const response = await apiClient.get('/approvals/credit-investigations', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch credit investigations:', error);
    return { success: false, data: [] };
  }
}

export async function fetchCreditInvestigationById(id) {
  try {
    const response = await apiClient.get(`/approvals/credit-investigations/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch credit investigation:', error);
    return { success: false, data: null };
  }
}

export async function patchCreditInvestigation(id, body) {
  try {
    const response = await apiClient.patch(`/approvals/credit-investigations/${id}`, body);
    return response.data;
  } catch (error) {
    console.error('Failed to update credit investigation:', error);
    return { success: false, message: error.response?.data?.message || 'Update failed.' };
  }
}

export async function fetchSpecialCollectionRequests() {
  try {
    const response = await apiClient.get('/approvals/special-collections');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch special collections:', error);
    return { success: false, data: [] };
  }
}

export async function patchSpecialCollectionRequest(id, body) {
  try {
    const response = await apiClient.patch(`/approvals/special-collections/${id}`, body);
    return response.data;
  } catch (error) {
    console.error('Failed to update special collection:', error);
    return { success: false, message: error.response?.data?.message || 'Update failed.' };
  }
}

export async function fetchApprovalCenterSummary() {
  try {
    const response = await apiClient.get('/approvals/center-summary');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch approval summary:', error);
    return { success: false, data: null };
  }
}

export function mapCreditInvestigationRow(row) {
  const flags = row.delinquency_flags_json ?? [];
  const payments = row.payment_history_json ?? [];
  return {
    id: String(row.ci_id),
    ciId: row.ci_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerCode: row.customer_code,
    submittedBy: row.submitted_by_name,
    submissionDate: row.created_at,
    delinquencyStatus: row.delinquency_status,
    status: row.status,
    purpose: row.purpose,
    monthlyIncome: Number(row.monthly_income || 0),
    businessType: row.business_type,
    references: row.references_summary,
    formRemarks: row.form_remarks,
    riskScore: row.risk_score ?? 0,
    leafletClassification: row.leaflet_classification,
    rejectionReason: row.rejection_reason,
    delinquencyFlags: Array.isArray(flags) ? flags : [],
    paymentHistory: Array.isArray(payments)
      ? payments.map((p) => ({
          date: p.date,
          amount: Number(p.amount || 0),
          status: p.status || 'Confirmed',
        }))
      : [],
  };
}

export function mapSpecialCollectionRow(row) {
  return {
    id: String(row.request_id),
    requestId: row.request_id,
    customerName: row.customer_name,
    accountNumber: row.customer_code,
    requestType: row.request_type,
    requestedBy: row.requested_by_name,
    date: row.created_at,
    amount: Number(row.amount || 0),
    status: row.status,
    notes: row.notes,
  };
}
