import apiClient from './apiClient.js';

export async function fetchOperationalAlerts(params = {}) {
  try {
    const response = await apiClient.get('/operational-alerts', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch operational alerts:', error);
    return { success: false, data: [] };
  }
}

export async function patchOperationalAlert(id, body) {
  try {
    const response = await apiClient.patch(`/operational-alerts/${id}`, body);
    return response.data;
  } catch (error) {
    console.error('Failed to update operational alert:', error);
    return { success: false, message: error.response?.data?.message || 'Update failed.' };
  }
}

export function mapOperationalAlertRow(row) {
  return {
    id: row.alert_id,
    type: row.alert_type,
    category: row.alert_type,
    branch: row.branch_name || '—',
    branchId: row.branch_id,
    title: row.title,
    message: row.message,
    severity: row.severity,
    time: row.created_at,
    date: row.created_at,
    status: row.status,
    resolved: row.status === 'Resolved',
    assignedToName: row.assigned_to_name,
  };
}
