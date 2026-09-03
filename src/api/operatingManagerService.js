import { api } from './apiClient.js';

export const fetchEnterpriseKPIs = () => api.get('/reports/kpi');
export const fetchSystemHealth = () => api.get('/dashboard/system-health');
