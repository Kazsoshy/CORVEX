import apiClient from './apiClient.js';

export async function getBranchAnalytics() {
  try {
    const response = await apiClient.get('/branch-manager/analytics');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch analytics:', error);
    return { success: false, data: null };
  }
}

export async function getBranchStaff() {
  try {
    const response = await apiClient.get('/branch-manager/staff');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch branch staff:', error);
    return { success: false, data: { collectors: [], salesAgents: [] } };
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

export async function getBranchCollectorDetail(collectorId) {
  try {
    const response = await apiClient.get(`/branch-manager/staff/collectors/${collectorId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collector detail:', error);
    return { success: false, data: null };
  }
}

export async function getBranchSalesAgentDetail(agentId) {
  try {
    const response = await apiClient.get(`/branch-manager/staff/sales/${agentId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales agent detail:', error);
    return { success: false, data: null };
  }
}
