import apiClient from './apiClient.js';

export async function fetchCentralInventory() {
  try {
    const response = await apiClient.get('/inventory/central');
    return response.data;
  } catch (err) {
    console.error('Failed to fetch central inventory:', err);
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to load central inventory.',
      data: [],
      byBranch: [],
      alerts: [],
      recentMovements: [],
      summary: null,
    };
  }
}

export async function realignCentralInventory() {
  try {
    const response = await apiClient.post('/inventory/central/realign');
    return response.data;
  } catch (err) {
    console.error('Failed to realign central inventory:', err);
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to realign central inventory.',
    };
  }
}

export async function fetchInventoryTransfers(params = {}) {
  try {
    const response = await apiClient.get('/inventory/transfers', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch inventory transfers:', err);
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to load transfers.',
      data: [],
    };
  }
}

export async function fetchInventoryTransferById(id) {
  try {
    const response = await apiClient.get(`/inventory/transfers/${id}`);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch transfer:', err);
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to load transfer.',
      data: null,
    };
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
  const lineCount = Number(row.line_count) || 0;
  return {
    id: row.transfer_id,
    ref: row.transfer_ref,
    product: row.product_name,
    qty: row.total_quantity ?? row.quantity,
    lineCount,
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
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to load restocks.',
      data: [],
    };
  }
}

export async function fetchBranchInventory(params = {}) {
  try {
    const response = await apiClient.get('/inventory/branch-inventory', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch branch inventory:', err);
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to load branch inventory.',
      data: [],
      count: 0,
    };
  }
}

/** Normalize flat movement rows into transaction cards when API is ungrouped/legacy. */
function normalizeMovementTransactions(payload) {
  if (!payload?.success) return payload;
  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (payload.grouped === true) return payload;
  const looksFlat = rows.length > 0
    && rows[0].movement_id != null
    && rows[0].group_key == null
    && rows[0].representative_movement_id == null;
  if (!looksFlat) return payload;

  const data = rows.map((row) => ({
    group_key: `single:${row.movement_id}`,
    kind: 'single',
    document_ref: row.movement_ref || `MOV-${row.movement_id}`,
    type: row.type,
    movement_date: row.movement_date,
    created_at: row.created_at,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    performed_by: row.performed_by,
    performed_by_name: row.performed_by_name,
    representative_movement_id: row.movement_id,
    product_count: 1,
    total_quantity: Number(row.quantity) || 0,
    mixed_units: false,
    unit_type: row.unit_type || 'Unit',
    unit_types: [row.unit_type || 'Unit'],
    product_preview: row.product_name ? [row.product_name] : [],
  }));

  return {
    ...payload,
    grouped: true,
    data,
    count: data.length,
  };
}

export async function fetchStockMovements(params = {}) {
  try {
    const response = await apiClient.get('/inventory/movements', { params });
    return normalizeMovementTransactions(response.data);
  } catch (err) {
    console.error('Failed to fetch stock movements:', err);
    return { success: false, data: [], count: 0 };
  }
}

export async function fetchStockMovementById(id) {
  if (id == null || id === '' || id === 'undefined' || id === 'null' || !Number.isFinite(Number(id))) {
    return { success: false, data: null, message: 'Invalid movement id.' };
  }
  try {
    const response = await apiClient.get(`/inventory/movements/${id}`);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch stock movement:', err);
    return {
      success: false,
      data: null,
      message: err.response?.data?.message || 'Movement not found.',
    };
  }
}

export async function fetchWarehouseDashboard() {
  try {
    const response = await apiClient.get('/inventory/dashboard');
    return response.data;
  } catch (err) {
    console.error('Failed to fetch warehouse dashboard:', err);
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to load warehouse dashboard.',
      data: null,
    };
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

export async function fetchStockCounts(params = {}) {
  try {
    const response = await apiClient.get('/inventory/stock-counts', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch stock counts:', err);
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to load stock counts.',
      data: [],
    };
  }
}

export async function fetchStockCountById(id) {
  try {
    const response = await apiClient.get(`/inventory/stock-counts/${id}`);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch stock count:', err);
    return { success: false, data: null, message: err.response?.data?.message || 'Failed to load stock count.' };
  }
}

export async function submitStockCount(body) {
  try {
    const response = await apiClient.post('/inventory/stock-counts', body);
    return response.data;
  } catch (err) {
    return {
      success: false,
      message: err.response?.data?.message || 'Failed to submit stock count.',
      data: err.response?.data?.data || null,
    };
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

export async function uploadProductImage(productId, file) {
  try {
    const token = localStorage.getItem('corvex_token');
    const response = await fetch(`${apiClient.defaults.baseURL}/products/${productId}/image`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
    const data = await response.json().catch(() => ({}));
    const nextToken = response.headers.get('x-session-token');
    if (nextToken) localStorage.setItem('corvex_token', nextToken);
    if (response.status === 401) {
      localStorage.removeItem('corvex_user');
      localStorage.removeItem('corvex_token');
    }
    if (!response.ok) {
      return { success: false, message: data.message || 'Could not save the product image.' };
    }
    return data;
  } catch {
    return { success: false, message: 'Could not save the product image.' };
  }
}

export async function deleteProductImage(productId) {
  try {
    const response = await apiClient.delete(`/products/${productId}/image`);
    return response.data;
  } catch (err) {
    return { success: false, message: err.response?.data?.message || 'Could not remove the product image.' };
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
