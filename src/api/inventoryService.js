import apiClient from './apiClient.js';

export async function fetchInventoryTransfers(params = {}) {
  try {
    const response = await apiClient.get('/inventory/transfers', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch inventory transfers:', err);
    return { success: false, data: [] };
  }
}

export async function fetchInventoryTransferById(id) {
  try {
    const response = await apiClient.get(`/inventory/transfers/${id}`);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch transfer:', err);
    return { success: false, data: null };
  }
}

export async function fetchRestocks(params = {}) {
  try {
    const response = await apiClient.get('/inventory/restocks', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch restocks:', err);
    return { success: false, data: [] };
  }
}

export async function fetchBranchInventory(params = {}) {
  try {
    const response = await apiClient.get('/inventory/branch-inventory', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch branch inventory:', err);
    return { success: false, data: [], count: 0 };
  }
}
