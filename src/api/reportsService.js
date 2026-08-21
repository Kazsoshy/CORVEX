import apiClient from './apiClient.js';

export async function getReportCollection(branchId) {
  try {
    const params = {};
    if (branchId) params.branch_id = branchId;
    const response = await apiClient.get('/reports/collection', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collection report:', error);
    return { success: false, data: null };
  }
}

export async function getReportSales(branchId) {
  try {
    const params = {};
    if (branchId) params.branch_id = branchId;
    const response = await apiClient.get('/reports/sales', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch sales report:', error);
    return { success: false, data: null };
  }
}

export async function getReportInventory(branchId) {
  try {
    const params = {};
    if (branchId) params.branch_id = branchId;
    const response = await apiClient.get('/reports/inventory', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch inventory report:', error);
    return { success: false, data: null };
  }
}

export async function getReportDelinquency(branchId) {
  try {
    const params = {};
    if (branchId) params.branch_id = branchId;
    const response = await apiClient.get('/reports/delinquency', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch delinquency report:', error);
    return { success: false, data: null };
  }
}

export async function getReportCompliance(branchId) {
  try {
    const params = {};
    if (branchId) params.branch_id = branchId;
    const response = await apiClient.get('/reports/compliance', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch compliance report:', error);
    return { success: false, data: null };
  }
}

export async function getReportKPI(branchId) {
  try {
    const params = {};
    if (branchId) params.branch_id = branchId;
    const response = await apiClient.get('/reports/kpi', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch KPI report:', error);
    return { success: false, data: null };
  }
}
