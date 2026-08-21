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
