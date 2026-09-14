import apiClient from './apiClient.js';

/**
 * Fetch audit logs from the database
 * @returns {Promise<{success: boolean, data?: array, message?: string}>}
 */
export async function fetchAuditLogs() {
  try {
    const response = await apiClient.get('/admin/audit-logs');
    return response.data;
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    return { success: false, message: error.response?.data?.message || 'Failed to fetch audit logs' };
  }
}
