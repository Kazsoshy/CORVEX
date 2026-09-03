import { api } from './apiClient.js';

export const fetchBranchManagerAnalytics = () => api.get('/branch-manager/analytics');
export const fetchBranchManagerStaff = () => api.get('/branch-manager/staff');
export const fetchDashboardSummary = () => api.get('/dashboard/system-health');
