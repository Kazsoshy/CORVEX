import apiClient from './apiClient.js';

export async function fetchNotifications() {
  try {
    const response = await apiClient.get('/notifications');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return { success: false, data: [], count: 0 };
  }
}

export async function markNotificationRead(id) {
  try {
    const response = await apiClient.patch(`/notifications/${id}/read`);
    return response.data;
  } catch (error) {
    console.error('Failed to mark notification read:', error);
    return { success: false };
  }
}

export async function markAllNotificationsRead() {
  try {
    const response = await apiClient.patch('/notifications/read-all');
    return response.data;
  } catch (error) {
    console.error('Failed to mark all notifications read:', error);
    return { success: false };
  }
}

export function mapNotificationRow(row, { opsBase = '/branch-manager', orgBase = '/operating-manager' } = {}) {
  const read = row.status === 'Read';
  const category = row.category || '';
  let relatedTo = null;
  if (category.includes('Approval')) relatedTo = `${opsBase}/approval-center`;
  else if (category.includes('Branch') || category.includes('Alert')) relatedTo = orgBase ? `${orgBase}/alerts` : `${opsBase}/alerts`;
  else if (category.includes('CI')) relatedTo = opsBase.includes('/sales') ? `${opsBase}/credit-investigations` : `${opsBase}/ci-approvals`;
  else if (category.includes('Inventory') || category.includes('Stock')) relatedTo = opsBase.includes('/sales') ? `${opsBase}/inventory` : `${opsBase}/approval-center`;
  else if (category.includes('Schedule')) relatedTo = `${opsBase}/schedule`;
  else if (category.includes('Sales')) relatedTo = `${opsBase}/purchase-requests`;
  else if (category.includes('Transfer')) {
    relatedTo = opsBase.includes('/warehouse') ? `${opsBase}/transfers` : `${opsBase}/approval-center`;
  }
  return {
    id: row.notification_id,
    title: row.title,
    message: row.message,
    type: category.toLowerCase(),
    category,
    read,
    time: row.created_at,
    relatedTo,
  };
}
