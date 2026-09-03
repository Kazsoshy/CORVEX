import { api } from './apiClient.js';

export const getReportCollection = (branch_id) => api.get('/reports/collection', branch_id ? { branch_id } : {});
export const getReportSales = (branch_id) => api.get('/reports/sales', branch_id ? { branch_id } : {});
export const getReportInventory = (branch_id) => api.get('/reports/inventory', branch_id ? { branch_id } : {});
export const getReportDelinquency = (branch_id) => api.get('/reports/delinquency', branch_id ? { branch_id } : {});
export const getReportCompliance = (branch_id) => api.get('/reports/compliance', branch_id ? { branch_id } : {});
export const getReportKPI = (branch_id) => api.get('/reports/kpi', branch_id ? { branch_id } : {});
