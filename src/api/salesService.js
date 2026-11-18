import apiClient from './apiClient.js';

export async function fetchCustomers(params = {}) {
  try {
    const response = await apiClient.get('/customers', { params });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Unknown error';
    const detail = error?.response?.data?.error || '';
    console.error('Failed to fetch customers:', message, detail);
    return { success: false, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }, message, detail };
  }
}

export async function fetchCustomerById(id) {
  try {
    const response = await apiClient.get(`/customers/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch customer:', error);
    return { success: false, data: null };
  }
}

export async function fetchSalesPurchaseRequests() {
  try {
    const response = await apiClient.get('/sales/purchase-requests');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch purchase requests:', error);
    return { success: false, data: [] };
  }
}

export async function fetchSalesPurchaseRequestById(requestId) {
  try {
    const response = await apiClient.get(`/sales/purchase-requests/${requestId}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load purchase request.',
    };
  }
}

export async function updateSalesPurchaseRequestStatus(requestId, status, extra = {}) {
  try {
    const response = await apiClient.patch(`/sales/purchase-requests/${requestId}`, { status, ...extra });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to update request.',
    };
  }
}

export async function updateSalesPurchaseRequestItems(requestId, items) {
  try {
    const response = await apiClient.put(`/sales/purchase-requests/${requestId}/items`, { items });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to update request lines.',
    };
  }
}

export async function createCustomer(payload) {
  try {
    const response = await apiClient.post('/customers', payload);
    return response.data;
  } catch (error) {
    const body = error?.response?.data || {};
    const message = body.message || error?.message || 'Failed to create customer';
    console.error('Failed to create customer:', error);
    return {
      success: false,
      message,
      status: error?.response?.status,
      code: body.code,
      match_summary: body.match_summary,
      matches: body.matches,
      data: body.data,
    };
  }
}

export async function decideCustomerIdentityReview(customerId, payload) {
  try {
    const response = await apiClient.post(`/customers/${customerId}/identity-review`, payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || error?.message || 'Failed to decide identity review.',
      status: error?.response?.status,
    };
  }
}

export async function fetchIdentityVerifications(params = {}) {
  try {
    const response = await apiClient.get('/customers/identity-verifications', { params });
    return response.data;
  } catch (error) {
    return { success: false, data: [], message: error?.response?.data?.message || error?.message };
  }
}

export async function fetchMyIdentityVerifications(params = {}) {
  try {
    const response = await apiClient.get('/customers/identity-verifications', {
      params: { ...params, mine: 1 },
    });
    return response.data;
  } catch (error) {
    return { success: false, data: [], message: error?.response?.data?.message || error?.message };
  }
}

export async function fetchIdentityVerificationById(verificationId) {
  try {
    const response = await apiClient.get(`/customers/identity-verifications/${verificationId}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      data: null,
      message: error?.response?.data?.message || error?.message || 'Failed to load verification.',
      status: error?.response?.status,
    };
  }
}

export async function requestIdentityVerification(payload) {
  try {
    const response = await apiClient.post('/customers/identity-verifications', payload);
    return response.data;
  } catch (error) {
    const body = error?.response?.data || {};
    return {
      success: false,
      message: body.message || error?.message || 'Failed to request verification.',
      status: error?.response?.status,
      data: body.data,
      idempotent: Boolean(body.idempotent),
    };
  }
}

export async function decideIdentityVerification(verificationId, payload) {
  try {
    const response = await apiClient.post(`/customers/identity-verifications/${verificationId}/decide`, payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || error?.message || 'Failed to decide verification.',
    };
  }
}

export async function requestIdentityBranchTransfer(verificationId, payload) {
  try {
    const response = await apiClient.post(
      `/customers/identity-verifications/${verificationId}/request-transfer`,
      payload
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || error?.message || 'Failed to request branch transfer.',
      status: error?.response?.status,
      data: error?.response?.data?.data,
    };
  }
}

export async function fetchIdentityCandidateProfile(verificationId, customerId) {
  try {
    const response = await apiClient.get(
      `/customers/identity-verifications/${verificationId}/candidates/${customerId}`
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      data: null,
      message: error?.response?.data?.message || error?.message || 'Failed to load candidate profile.',
      status: error?.response?.status,
    };
  }
}

export async function fetchBranchTransfers(params = {}) {
  try {
    const response = await apiClient.get('/customers/branch-transfers', { params });
    return response.data;
  } catch (error) {
    return { success: false, data: [], message: error?.response?.data?.message || error?.message };
  }
}

export async function requestCustomerBranchTransfer(customerId, payload) {
  try {
    const response = await apiClient.post(`/customers/${customerId}/branch-transfer-requests`, payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || error?.message || 'Failed to request branch transfer.',
      status: error?.response?.status,
      data: error?.response?.data?.data,
    };
  }
}

export async function fetchBranchTransferTargetTerritories(transferId) {
  try {
    const response = await apiClient.get(`/customers/branch-transfers/${transferId}/target-territories`);
    return response.data;
  } catch (error) {
    return { success: false, data: [], message: error?.response?.data?.message || error?.message };
  }
}

export async function sourceSubmitBranchTransfer(transferId, payload) {
  try {
    const response = await apiClient.post(`/customers/branch-transfers/${transferId}/source-submit`, payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || error?.message || 'Failed to submit transfer.',
    };
  }
}

export async function omDecideBranchTransfer(transferId, payload) {
  try {
    const response = await apiClient.post(`/customers/branch-transfers/${transferId}/om-decide`, payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || error?.message || 'Failed to decide transfer.',
    };
  }
}

export async function updateCustomer(customerId, payload) {
  try {
    const response = await apiClient.put(`/customers/${customerId}`, payload);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to update customer';
    console.error('Failed to update customer:', error);
    return { success: false, message, status: error?.response?.status };
  }
}

/** Sales Agent maker-checker path for protected customer master-data fields. */
export async function submitCustomerChangeRequest(customerId, payload) {
  try {
    const response = await apiClient.post(`/customers/${customerId}/change-requests`, payload);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to submit change request';
    return { success: false, message, status: error?.response?.status };
  }
}

export async function fetchTerritories(params = {}) {
  try {
    const response = await apiClient.get('/territories', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch territories:', error);
    return { success: false, data: [] };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Invoice Items API
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchInvoices(params = {}) {
  try {
    const response = await apiClient.get('/sales/invoices', { params });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch invoices';
    const detail = error?.response?.data?.error || '';
    console.error('Failed to fetch invoices:', message, detail);
    return { success: false, data: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 }, message, detail };
  }
}

export async function fetchInvoiceById(invoiceId) {
  try {
    const response = await apiClient.get(`/sales/invoices/${invoiceId}`);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch invoice';
    console.error('Failed to fetch invoice:', error);
    return { success: false, data: null, message };
  }
}

export async function fetchPaymentMethods() {
  try {
    const response = await apiClient.get('/sales/payment-methods');
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch payment methods';
    console.error('Failed to fetch payment methods:', error);
    return { success: false, data: [], message };
  }
}

export async function createSalesInvoice(payload) {
  try {
    const response = await apiClient.post('/sales/invoices', payload);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to log sale';
    console.error('Failed to create sales invoice:', error);
    return { success: false, offline: !error.response, message };
  }
}

export async function fetchInvoiceItems(invoiceId) {
  try {
    const response = await apiClient.get(`/sales/invoices/${invoiceId}/items`);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch invoice items';
    console.error('Failed to fetch invoice items:', error);
    return { success: false, data: [], count: 0, message };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Field Visits API
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchFieldVisits(params = {}) {
  try {
    const response = await apiClient.get('/sales/visits', { params });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch field visits';
    const detail = error?.response?.data?.error || '';
    console.error('Failed to fetch field visits:', message, detail);
    return { success: false, data: [], count: 0, message, detail };
  }
}

export async function fetchFieldVisitById(id) {
  try {
    const response = await apiClient.get(`/sales/visits/${id}`);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch field visit';
    console.error('Failed to fetch field visit:', error);
    return { success: false, data: null, message };
  }
}

export async function createFieldVisit(data) {
  try {
    const response = await apiClient.post('/sales/visits', data);
    return response.data;
  } catch (error) {
    console.error('Failed to create field visit:', error);
    return { success: false, message: error?.response?.data?.message || 'Failed to create field visit' };
  }
}

export async function updateFieldVisit(id, data) {
  try {
    const response = await apiClient.put(`/sales/visits/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Failed to update field visit:', error);
    return { success: false, message: error?.response?.data?.message || 'Failed to update field visit' };
  }
}

export async function fetchSalesDashboard() {
  try {
    const response = await apiClient.get('/sales/dashboard');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales dashboard:', error);
    return { success: false, data: null };
  }
}

export async function submitSalesCreditInvestigation(payload) {
  try {
    const response = await apiClient.post('/sales/credit-investigations', payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to submit credit review.',
      data: error.response?.data?.data,
    };
  }
}

export async function fetchSalesCreditInvestigations(params = {}) {
  try {
    const response = await apiClient.get('/sales/credit-investigations', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales credit investigations:', error);
    return { success: false, data: [] };
  }
}

export async function fetchSalesCreditInvestigationById(id) {
  try {
    const response = await apiClient.get(`/sales/credit-investigations/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales credit investigation:', error);
    return { success: false, data: null };
  }
}

export async function fetchSalesCreditRecommendations(params = {}) {
  try {
    const response = await apiClient.get('/sales/credit-recommendations', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales credit recommendations:', error);
    return { success: false, data: [] };
  }
}

export async function convertSalesCreditRecommendation(id, body = {}) {
  try {
    const response = await apiClient.post(`/sales/credit-recommendations/${id}/convert`, body);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to convert recommendation.',
      data: error.response?.data?.data,
    };
  }
}

export async function fetchSalesFieldReports() {
  try {
    const response = await apiClient.get('/sales/field-reports');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales field reports:', error);
    return { success: false, data: [], count: 0 };
  }
}

export async function fetchSalesFieldReportById(id) {
  try {
    const response = await apiClient.get(`/sales/field-reports/${id}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Failed to fetch field activity report.',
      data: null,
    };
  }
}

export async function submitSalesFieldReport(payload) {
  try {
    const response = await apiClient.post('/sales/field-reports', payload);
    return response.data;
  } catch (error) {
    const unreachable = !error.response;
    return {
      success: false,
      offline: unreachable,
      status: error.response?.status,
      message: error.response?.data?.message || (unreachable
        ? 'The server could not be reached.'
        : 'Failed to submit report.'),
      data: error.response?.data?.data || null,
    };
  }
}

export async function updateSalesFieldReport(id, payload) {
  try {
    const response = await apiClient.put(`/sales/field-reports/${id}`, payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to update field activity report.',
      data: error.response?.data?.data || null,
    };
  }
}

export async function fetchSalesAuditLogs(params = {}) {
  try {
    const response = await apiClient.get('/sales/audit-logs', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales audit logs:', error);
    return { success: false, data: [] };
  }
}

export async function fetchSalesAreaAssignments(params = {}) {
  try {
    const response = await apiClient.get('/sales/area-assignments', { params });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch area assignments';
    console.error('Failed to fetch area assignments:', message);
    return { success: false, data: [], count: 0, message, meta: null };
  }
}

export async function fetchSalesAreaAssignmentById(id) {
  try {
    const response = await apiClient.get(`/sales/area-assignments/${id}`);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch area assignment';
    console.error('Failed to fetch area assignment:', message);
    return { success: false, data: null, message };
  }
}

export async function updateSalesAreaAssignmentStatus(id, status, payload = {}) {
  try {
    const response = await apiClient.patch(`/sales/area-assignments/${id}/status`, {
      status,
      ...payload,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Failed to update area assignment.',
    };
  }
}

export async function fetchSalesAreaAssignmentCustomers(id) {
  try {
    const response = await apiClient.get(`/sales/area-assignments/${id}/customers`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      data: [],
      count: 0,
      message: error?.response?.data?.message || 'Failed to load area customers.',
    };
  }
}

export async function previewSalesAreaAssignmentRoute(id, payload = {}) {
  try {
    const response = await apiClient.post(`/sales/area-assignments/${id}/route-preview`, payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      data: null,
      message: error?.response?.data?.message || 'Failed to preview route.',
    };
  }
}
