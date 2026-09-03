import { api } from './apiClient.js';

export const getBranchAnalytics = () => api.get('/branch-manager/analytics');
export const getBranchStaff = async () => {
  const result = await api.get('/branch-manager/staff');
  return result.success ? result : { success: false, data: { collectors: [], salesAgents: [] } };
};
export const getBranchCustomers = async () => {
  const result = await api.get('/branch-manager/customers');
  return result.success ? result : { success: false, data: { customers: [], mapAccounts: [] } };
};
export const getBranchCustomerById = (id) => api.get(`/branch-manager/customers/${id}`);
export const getBranchAlerts = async () => {
  const result = await api.get('/branch-manager/alerts');
  return result.success ? result : { success: false, data: { alerts: [] } };
};
export const updateCIStatus = (id, status, reason = '') => api.put(`/branch-manager/ci-approvals/${id}`, { status, reason });
