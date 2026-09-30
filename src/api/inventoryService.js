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

export async function patchInventoryTransfer(id, body) {
  try {
    const response = await apiClient.patch(`/inventory/transfers/${id}`, body);
    return response.data;
  } catch (err) {
    console.error('Failed to update transfer:', err);
    return { success: false, message: err.response?.data?.message || 'Update failed.' };
  }
}

export function mapInventoryTransferRow(row) {
  return {
    id: row.transfer_id,
    ref: row.transfer_ref,
    product: row.product_name,
    qty: row.quantity,
    from: row.source_branch,
    to: row.destination_branch,
    sourceBranchId: row.source_branch_id,
    destinationBranchId: row.destination_branch_id,
    submittedByUserId: row.submitted_by,
    requestedBy: row.submitted_by_name || '—',
    date: row.submitted_date,
    status: row.status,
    value: 0,
  };
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

export async function fetchStockMovements(params = {}) {
  try {
    const response = await apiClient.get('/inventory/movements', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch stock movements:', err);
    return { success: false, data: [], count: 0 };
  }
}

export async function fetchStockMovementById(id) {
  try {
    const response = await apiClient.get(`/inventory/movements/${id}`);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch stock movement:', err);
    return { success: false, data: null };
  }
}

export async function fetchWarehouseDashboard() {
  try {
    const response = await apiClient.get('/inventory/dashboard');
    return response.data;
  } catch (err) {
    console.error('Failed to fetch warehouse dashboard:', err);
    return { success: false, data: null };
  }
}

export async function fetchInventoryBranches() {
  try {
    const response = await apiClient.get('/inventory/branches');
    return response.data;
  } catch (err) {
    console.error('Failed to fetch branches:', err);
    return { success: false, data: [] };
  }
}

export async function fetchRestockById(id) {
  try {
    const response = await apiClient.get(`/inventory/restocks/${id}`);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch restock:', err);
    return { success: false, data: null };
  }
}

export async function createRestock(body) {
  try {
    const response = await apiClient.post('/inventory/restocks', body);
    return response.data;
  } catch (err) {
    return { success: false, message: err.response?.data?.message || 'Failed to record restock.' };
  }
}

export async function submitStockCount(body) {
  try {
    const response = await apiClient.post('/inventory/stock-counts', body);
    return response.data;
  } catch (err) {
    return { success: false, message: err.response?.data?.message || 'Failed to submit stock count.' };
  }
}

export async function createInventoryTransfer(body) {
  try {
    const response = await apiClient.post('/inventory/transfers', body);
    return response.data;
  } catch (err) {
    return { success: false, message: err.response?.data?.message || 'Failed to create transfer.' };
  }
}

export async function createWarehouseProduct(body) {
  try {
    const response = await apiClient.post('/inventory/products', body);
    return response.data;
  } catch (err) {
    return { success: false, message: err.response?.data?.message || 'Failed to create product.' };
  }
}

export async function fetchWarehouseAuditLogs() {
  try {
    const response = await apiClient.get('/inventory/audit-logs');
    return response.data;
  } catch (err) {
    console.error('Failed to fetch warehouse audit logs:', err);
    return { success: false, data: [] };
  }
}
