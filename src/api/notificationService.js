import apiClient from './apiClient.js';

export const NOTIFICATIONS_EVENT = 'corvex-notifications-updated';

function emitNotificationsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
  }
}

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
    if (response.data?.success) emitNotificationsUpdated();
    return response.data;
  } catch (error) {
    console.error('Failed to mark notification read:', error);
    return { success: false };
  }
}

export async function markAllNotificationsRead() {
  try {
    const response = await apiClient.patch('/notifications/read-all');
    if (response.data?.success) emitNotificationsUpdated();
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
      ? `${opsBase}/branch-stock`
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
    relatedTo = isSales ? `${opsBase}/history` : `${opsBase}/field-operations`;
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

export function resolveNotificationTargetForRole(row, roleKey) {
  if (!row || !roleKey) return null;
  if (row.relatedTo) return row.relatedTo;
  const cat = String(row.category || row.type || '').toLowerCase();

  switch (roleKey) {
    case 'collector':
      if (cat.includes('schedule') || cat.includes('route') || cat.includes('visit')) return '/collector/route';
      if (cat.includes('receipt') || cat.includes('collection')) return '/collector/history';
      if (cat.includes('ci') || cat.includes('credit')) return '/collector/accounts';
      return '/collector/notifications';

    case 'sales': {
      const mapped = mapNotificationRow(row, { opsBase: '/sales', orgBase: '/sales' });
      return mapped.relatedTo || '/sales/notifications';
    }

    case 'warehouse':
      if (cat.includes('inventory') || cat.includes('stock')) return '/warehouse/branch-stock';
      if (cat.includes('transfer')) return '/warehouse/transfers';
      if (cat.includes('restock')) return '/warehouse/restock-history';
      return '/warehouse/notifications';

    case 'branchManager': {
      const mapped = mapNotificationRow(row, { opsBase: '/branch-manager', orgBase: '/branch-manager' });
      return mapped.relatedTo || '/branch-manager/notifications';
    }

    case 'operatingManager': {
      const mapped = mapNotificationRow(row, { opsBase: '/operating-manager/operations', orgBase: '/operating-manager' });
      return mapped.relatedTo || '/operating-manager/notifications';
    }

    case 'customer':
      if (cat.includes('receipt') || cat.includes('payment')) return '/customer/receipts';
      if (cat.includes('statement')) return '/customer/statements';
      if (cat.includes('purchase') || cat.includes('request')) return '/customer/purchase-requests';
      if (cat.includes('account') || cat.includes('overdue')) return '/customer/account-details';
      return '/customer/notifications';

    case 'superAdmin':
      if (cat.includes('security') || cat.includes('login')) return '/super-admin/security';
      if (cat.includes('backup')) return '/super-admin/backup';
      if (cat.includes('user') || cat.includes('role')) return '/super-admin/users';
      if (cat.includes('audit')) return '/super-admin/audit-logs';
      return '/super-admin/notifications';

    default:
      return null;
  }
}
