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

/**
 * Map API notification rows for UI + deep-links by role base path.
 * @param {object} row
 * @param {{ opsBase?: string, orgBase?: string }} opts
 */
export function mapNotificationRow(row, { opsBase = '/branch-manager', orgBase = '/operating-manager' } = {}) {
  const read = row.status === 'Read';
  const category = row.category || '';
  const cat = category.toLowerCase();
  const isSales = opsBase.includes('/sales');
  const isWarehouse = opsBase.includes('/warehouse');
  const isCollector = opsBase.includes('/collector');
  const isOm = opsBase.includes('/operating-manager') || orgBase.includes('/operating-manager');

  let relatedTo = null;
  if (cat.includes('overdue')) {
    relatedTo = `${orgBase}/saw-results`;
  } else if (cat.includes('approval')) {
    relatedTo = isSales ? `${opsBase}/history` : `${opsBase}/approval-center`;
  } else if (cat.includes('branch') || cat.includes('alert')) {
    relatedTo = isOm ? `${orgBase}/alerts` : `${opsBase}/alerts`;
  } else if (cat.includes('ci')) {
    relatedTo = isSales ? `${opsBase}/credit-investigations` : `${opsBase}/ci-approvals`;
  } else if (cat.includes('inventory') || cat.includes('stock')) {
    relatedTo = isWarehouse
      ? `${opsBase}/central-inventory`
      : isSales
        ? `${opsBase}/inventory`
        : `${opsBase}/approval-center`;
  } else if (cat.includes('invoice')) {
    relatedTo = isSales ? `${opsBase}/history` : `${opsBase}/approval-center`;
  } else if (cat.includes('schedule') || cat.includes('route')) {
    relatedTo = isCollector
      ? `${opsBase}/route`
      : isSales
        ? `${opsBase}/schedule`
        : `${opsBase}/field-operations`;
  } else if (cat.includes('sales')) {
    relatedTo = isSales ? `${opsBase}/purchase-requests` : `${opsBase}/field-operations`;
  } else if (cat.includes('transfer')) {
    relatedTo = isWarehouse ? `${opsBase}/transfers` : `${opsBase}/approval-center`;
  }

  return {
    id: row.notification_id,
    notification_id: row.notification_id,
    title: row.title,
    message: row.message,
    type: cat,
    category,
    status: row.status,
    read,
    time: row.created_at,
    created_at: row.created_at,
    relatedTo,
  };
}

export function countUnreadNotifications(rows = []) {
  return rows.filter((row) => row.status !== 'Read' && !row.read).length;
}
