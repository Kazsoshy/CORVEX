import apiClient from './apiClient.js';

export async function getBranchAnalytics() {
  try {
    const response = await apiClient.get('/branch-manager/analytics');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch analytics:', error);
    return {
      success: false,
      data: null,
      message: error?.response?.data?.message || 'Failed to fetch analytics.',
    };
  }
}

export async function getBranchStaff(params = {}) {
  try {
    const response = await apiClient.get('/branch-manager/staff', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch staff:', error);
    return { success: false, data: { collectors: [], salesAgents: [] } };
  }
}

/** Period-scoped evaluation metrics. period: 'week' | 'month' */
export async function getStaffPerformance(params = {}) {
  try {
    const response = await apiClient.get('/branch-manager/staff-performance', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch staff performance:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load staff performance.',
      data: null,
    };
  }
}

export async function getBranchCustomers() {
  try {
    const response = await apiClient.get('/branch-manager/customers');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch customers:', error);
    return { success: false, data: { customers: [], mapAccounts: [] } };
  }
}

export async function getSawMapRoads(params = {}) {
  try {
    const response = await apiClient.get('/branch-manager/map/saw-roads', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch SAW road routes:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load SAW road routes.',
      data: [],
    };
  }
}

export async function getBranchMap(params = {}) {
  try {
    const response = await apiClient.get('/branch-manager/map', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch map:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load map data.',
      data: null,
    };
  }
}

export async function getBranchCustomerById(id) {
  try {
    const response = await apiClient.get(`/branch-manager/customers/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch customer:', error);
    return { success: false, data: null };
  }
}

export async function getBranchAlerts() {
  try {
    const response = await apiClient.get('/branch-manager/alerts');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch alerts:', error);
    return { success: false, data: { alerts: [] } };
  }
}

export async function getBranchAuditLogs(params = {}) {
  try {
    const response = await apiClient.get('/branch-manager/audit-logs', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch audit logs:', error);
    return { success: false, data: [] };
  }
}

export async function getBranchCollectorDetail(collectorId, params = {}) {
  try {
    const response = await apiClient.get(`/branch-manager/staff/collectors/${collectorId}`, {
      params,
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collector detail:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to load collector detail.',
      data: null,
    };
  }
}

export async function fetchCollectorSawPriority(collectorId, params = {}) {
  try {
    const response = await apiClient.get(
      `/branch-manager/staff/collectors/${collectorId}/saw-priority`,
      { params }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collector priority list:', error);
    return { success: false, data: [], meta: null };
  }
}

export async function previewCollectorCollectionRoute(collectorId, body) {
  try {
    const response = await apiClient.post(
      `/branch-manager/staff/collectors/${collectorId}/route-preview`,
      body
    );
    return response.data;
  } catch (error) {
    console.error('Failed to preview collection route:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to preview route.',
      data: [],
    };
  }
}

export async function assignCollectorCollectionRoute(collectorId, body) {
  try {
    const response = await apiClient.post(
      `/branch-manager/staff/collectors/${collectorId}/collection-assignments`,
      body
    );
    return response.data;
  } catch (error) {
    console.error('Failed to assign collection route:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to assign collection visits.',
      data: error.response?.data?.data || null,
    };
  }
}

export async function getFieldActivityReports(params = {}) {
  try {
    const response = await apiClient.get('/branch-manager/field-activity-reports', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch field activity reports:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load field activity reports.',
      data: [],
    };
  }
}

export async function getFieldActivityReport(reportId) {
  try {
    const response = await apiClient.get(`/branch-manager/field-activity-reports/${reportId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch field activity report:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load field activity report.',
      data: null,
    };
  }
}

export async function getBranchSalesAgentDetail(agentId, params = {}) {
  try {
    const response = await apiClient.get(`/branch-manager/staff/sales/${agentId}`, { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales agent detail:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load sales agent detail.',
      data: null,
    };
  }
}

export async function getSalesAgentAreaAssignments(agentId, params = {}) {
  try {
    const response = await apiClient.get(`/branch-manager/staff/sales/${agentId}/area-assignments`, { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales area assignments:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load area assignments.',
      data: [],
    };
  }
}

export async function assignSalesAgentArea(agentId, body) {
  try {
    const response = await apiClient.post(
      `/branch-manager/staff/sales/${agentId}/area-assignments`,
      body
    );
    return response.data;
  } catch (error) {
    console.error('Failed to assign sales area:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to assign area.',
      data: error.response?.data?.data || null,
    };
  }
}

export async function fetchBranchProducts(params = {}) {
  try {
    const response = await apiClient.get('/products', {
      params: { limit: 100, status: undefined, ...params },
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to load products.',
      data: [],
    };
  }
}
