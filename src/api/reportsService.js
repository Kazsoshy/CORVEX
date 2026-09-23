import apiClient from './apiClient.js';

function normalizeReportParams(input) {
  if (input === undefined || input === null) return {};
  if (typeof input === 'number' || typeof input === 'string') {
    return { branch_id: input };
  }
  return { ...input };
}

export async function getReportCollection(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/collection', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collection report:', error);
    return { success: false, data: null };
  }
}

export async function getReportSales(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/sales', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales report:', error);
    return { success: false, data: null };
  }
}

export async function getReportInventory(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/inventory', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch inventory report:', error);
    return { success: false, data: null };
  }
}

export async function getReportDelinquency(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/delinquency', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch delinquency report:', error);
    return { success: false, data: null };
  }
}

export async function getReportCompliance(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/compliance', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch compliance report:', error);
    return { success: false, data: null };
  }
}

export async function getReportKPI(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/kpi', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch KPI report:', error);
    return { success: false, data: null };
  }
}

export async function getExecutiveDashboard(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/executive', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch executive dashboard:', error);
    return { success: false, data: null };
  }
}

export async function getOperatingManagerAnalytics(params = {}) {
  try {
    const response = await apiClient.get('/reports/operating-manager', { params: normalizeReportParams(params) });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch operating manager analytics:', error);
    return { success: false, data: null };
  }
}

export async function getReportInvoices(params = {}) {
  try {
    const response = await apiClient.get('/reports/invoices', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch invoices report:', error);
    return { success: false, data: [] };
  }
}

export async function getPerformanceHistory(branchId) {
  try {
    const params = normalizeReportParams(branchId);
    const response = await apiClient.get('/reports/performance-history', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch performance history:', error);
    return { success: false, data: null };
  }
}

export async function getCreditHistory(params = {}) {
  try {
    const response = await apiClient.get('/reports/credit-history', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch credit history:', error);
    return {
      success: false,
      data: [],
      count: 0,
      message: error?.response?.data?.message || 'Failed to load credit history.',
    };
  }
}
