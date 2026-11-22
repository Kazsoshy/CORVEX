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

function relatedEntityOf(row) {
  return String(row?.related_entity || row?.relatedEntity || '').trim().toLowerCase();
}

function relatedIdOf(row) {
  const raw = row?.related_id ?? row?.relatedId;
  if (raw == null || raw === '') return null;
  return String(raw).trim();
}

function approvalCenterBase(roleKey, opsBase) {
  if (roleKey === 'operatingManager' || String(opsBase || '').includes('/operating-manager')) {
    return '/operating-manager/operations/approval-center';
  }
  if (roleKey === 'branchManager' || String(opsBase || '').includes('/branch-manager')) {
    return `${opsBase || '/branch-manager'}/approval-center`;
  }
  return null;
}

function withQuery(path, params = {}) {
  if (!path) return path;
  try {
    const url = new URL(path, 'http://corvex.local');
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === '') return;
      if (!url.searchParams.get(key)) url.searchParams.set(key, String(value));
    });
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const parts = Object.entries(params)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    if (!parts.length) return path;
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}${parts.join('&')}`;
  }
}

/** Infer entity from related_entity, category, title, or message. */
export function inferNotificationEntity(row) {
  const entity = relatedEntityOf(row);
  if (entity) return entity;
  const cat = String(row?.category || row?.type || '').toLowerCase();
  const title = String(row?.title || '').toLowerCase();
  const message = String(row?.message || '');

  if (cat.includes('transfer') || title.includes('transfer') || /\bTRF-[A-Z0-9-]+/i.test(message)) return 'transfer';
  if (cat.includes('restock') || title.includes('restock') || /\bRST-[A-Z0-9-]+/i.test(message)) return 'restock';
  if (cat.includes('stock count') || title.includes('stock count') || /\bSC-[A-Z0-9-]+/i.test(message)) return 'stock_count';
  if (cat.includes('invoice') || title.includes('sale ') || title.includes('sale confirmed') || title.includes('sale rejected') || /\binvoice\s+/i.test(message) || /\bINV-[A-Z0-9-]+/i.test(message)) {
    return 'invoice';
  }
  if (cat.includes('overdue') || title.includes('overdue')) {
    return title.includes('summary') ? 'overdue' : 'customer';
  }
  if (cat === 'ci' || cat.includes('credit') || title.includes('credit')) {
    return title.includes('flag') ? 'customer' : 'ci';
  }
  if (cat.includes('customer')) return 'customer';
  if (cat.includes('identity')) return 'identity';
  if (cat.includes('receipt') || cat.includes('collection') || cat.includes('payment')) return 'collection';
  if (cat.includes('purchase')) return 'purchase_request';
  if (cat.includes('schedule') || cat.includes('route') || cat.includes('assignment')) return 'schedule';
  if (cat.includes('stock') || cat.includes('inventory') || title.includes('inventory') || title.includes('low-stock') || title.includes('reorder')) {
    return 'stock';
  }
  if (cat.includes('security')) return 'security';
  if (cat.includes('approval') && /invoice/i.test(message)) return 'invoice';
  if (cat.includes('approval')) return 'approval';
  return '';
}

/** Extract record id or document ref from stored fields / message text. */
export function extractNotificationRecordId(row, entity = null) {
  const direct = relatedIdOf(row);
  if (direct) return direct;

  const kind = entity || inferNotificationEntity(row);
  const message = `${row?.title || ''} ${row?.message || ''}`;

  if (kind === 'transfer') {
    const ref = message.match(/\b(TRF-[A-Z0-9-]+)\b/i);
    if (ref) return ref[1].toUpperCase();
    const num = message.match(/\btransfer\s+#?(\d+)\b/i);
    if (num) return num[1];
  }
  if (kind === 'restock') {
    const ref = message.match(/\b(RST-[A-Z0-9-]+)\b/i);
    if (ref) return ref[1].toUpperCase();
  }
  if (kind === 'stock_count') {
    const ref = message.match(/\b(SC-[A-Z0-9-]+)\b/i);
    if (ref) return ref[1].toUpperCase();
  }
  if (kind === 'invoice') {
    const inv = message.match(/\b(INV-[A-Z0-9-]+)\b/i);
    if (inv) return inv[1].toUpperCase();
    const labeled = message.match(/\binvoice\s+(INV-[A-Z0-9-]+|\d+)\b/i);
    if (labeled) return labeled[1].toUpperCase();
  }
  if (kind === 'ci') {
    const m = message.match(/\bCI\s*#?(\d+)\b/i);
    if (m) return m[1];
  }
  if (kind === 'purchase_request') {
    const m = message.match(/Request\s*#(\d+)/i);
    if (m) return m[1];
  }
  if (kind === 'customer' || kind === 'overdue') {
    const m = message.match(/\(#?(\d+)\)/);
    if (m) return m[1];
  }
  if (kind === 'collection' || kind === 'receipt') {
    const receipt = message.match(/\breceipt\s+([A-Z0-9][A-Z0-9\-_/]*)/i);
    if (receipt) return receipt[1];
  }
  return null;
}

function isNumericId(value) {
  return /^\d+$/.test(String(value || ''));
}

/**
 * Build the best deep-link path for a notification + role context.
 */
export function buildNotificationTarget(row, {
  roleKey = null,
  opsBase = '/branch-manager',
  orgBase = '/operating-manager',
} = {}) {
  const resolved = resolveNotificationNavigation(row, { roleKey, opsBase, orgBase });
  return resolved?.path || null;
}

/**
 * Resolve path + record focus metadata for a notification.
 */
export function resolveNotificationNavigation(row, {
  roleKey = null,
  opsBase = '/branch-manager',
  orgBase = '/operating-manager',
} = {}) {
  if (!row) return null;

  const entity = inferNotificationEntity(row);
  const id = extractNotificationRecordId(row, entity);
  const cat = String(row.category || row.type || '').toLowerCase();
  const isSales = roleKey === 'sales' || String(opsBase).includes('/sales');
  const isWarehouse = roleKey === 'warehouse' || String(opsBase).includes('/warehouse');
  const isCollector = roleKey === 'collector' || String(opsBase).includes('/collector');
  const isCustomer = roleKey === 'customer' || String(opsBase).includes('/customer');
  const isOm = roleKey === 'operatingManager' || String(opsBase).includes('/operating-manager')
    || String(orgBase).includes('/operating-manager');
  const isBm = roleKey === 'branchManager' || String(opsBase).includes('/branch-manager');
  const isAdmin = roleKey === 'superAdmin' || String(opsBase).includes('/super-admin');
  const approvalBase = approvalCenterBase(roleKey, opsBase);

  const focusParams = id ? { id, highlight: id } : {};
  let path = null;

  switch (entity) {
    case 'transfer':
      if (isWarehouse && id && isNumericId(id)) path = withQuery(`/warehouse/transfers/${id}`, { highlight: id });
      else if (isWarehouse && id) path = withQuery('/warehouse/transfers', { highlight: id, tab: 'requests' });
      else if (approvalBase) path = withQuery(`${approvalBase}`, { tab: 'transfers', ...focusParams });
      else if (isWarehouse) path = '/warehouse/transfers';
      break;

    case 'restock':
      if (isWarehouse && id && isNumericId(id)) path = withQuery(`/warehouse/restock-history/${id}`, { highlight: id });
      else if (isWarehouse && id) path = withQuery('/warehouse/restock-history', { highlight: id });
      else if (approvalBase) path = withQuery(`${approvalBase}`, { tab: 'restocks', ...focusParams });
      else if (isWarehouse) path = '/warehouse/restock-history';
      break;

    case 'stock_count':
      if (isWarehouse && id && isNumericId(id)) path = withQuery(`/warehouse/stock-counts/${id}`, { highlight: id });
      else if (isWarehouse && id) path = withQuery('/warehouse/stock-counts', { highlight: id });
      else if (approvalBase) path = withQuery(`${approvalBase}`, { tab: 'stock-counts', ...focusParams });
      else if (isWarehouse) path = '/warehouse/stock-counts';
      break;

    case 'invoice':
      if (isSales && id) path = withQuery(`/sales/invoices/${encodeURIComponent(id)}`, { highlight: id });
      else if (approvalBase) path = withQuery(`${approvalBase}`, { tab: 'invoices', ...focusParams });
      else if (isSales) path = '/sales/history';
      else if (isBm) path = `${opsBase}/reports/invoices`;
      break;

    case 'collection':
    case 'receipt':
      if (isCustomer && id) path = withQuery(`/customer/receipts/${encodeURIComponent(id)}`, { highlight: id });
      else if (isCustomer) path = '/customer/receipts';
      else if (isCollector && id && isNumericId(id)) path = withQuery(`/collector/receipts/${id}`, { highlight: id });
      else if (isCollector) path = '/collector/history';
      else if (approvalBase) path = withQuery(`${approvalBase}`, { tab: 'collections', ...focusParams });
      break;

    case 'ci':
      if (isSales && id) path = withQuery(`/sales/credit-investigations/${id}`, { highlight: id });
      else if (isSales) path = '/sales/credit-investigations';
      else if ((isBm || isOm) && id && isNumericId(id)) {
        path = withQuery(
          `${isOm ? '/operating-manager/operations' : opsBase}/ci-approvals/${id}`,
          { highlight: id }
        );
      } else if (approvalBase) path = withQuery(`${approvalBase}`, { tab: 'ci', ...focusParams });
      else if (isCollector) path = '/collector/accounts';
      break;

    case 'customer_change':
      if (approvalBase) path = withQuery(`${approvalBase}`, { tab: 'customer-changes', ...focusParams });
      else if (isBm && id) path = withQuery(`${opsBase}/customers/${id}`, { highlight: id });
      break;

    case 'identity':
      if (approvalBase) {
        path = withQuery(`${approvalBase}`, {
          tab: 'identity',
          verificationId: id || undefined,
          highlight: id || undefined,
        });
      } else if (isSales && id) path = withQuery(`/sales/customers/verification/${id}`, { highlight: id });
      break;

    case 'customer':
      if (isOm && id) path = withQuery(`/operating-manager/customers/${id}`, { highlight: id });
      else if (isBm && id) path = withQuery(`${opsBase}/customers/${id}`, { highlight: id });
      else if (isSales && id) path = withQuery(`/sales/customers/${id}`, { highlight: id });
      else if (isCollector && id) path = withQuery(`/collector/accounts/${id}`, { highlight: id });
      else if (isCustomer) path = '/customer/account-details';
      else if (cat.includes('overdue')) {
        if (isOm) path = '/operating-manager/saw-results';
        else if (isBm) path = `${opsBase}/reports/delinquency`;
      }
      break;

    case 'overdue':
      if (isOm) path = '/operating-manager/saw-results';
      else if (isBm) path = `${opsBase}/reports/delinquency`;
      else if (isCustomer) path = '/customer/account-details';
      else if (isCollector) path = '/collector/accounts';
      break;

    case 'product':
      if (isWarehouse && id) path = withQuery(`/warehouse/product/${id}`, { highlight: id });
      else if (isWarehouse) path = '/warehouse/branch-stock';
      else if (isBm) path = `${opsBase}/branch-inventory`;
      break;

    case 'stock':
      if (isWarehouse) path = '/warehouse/branch-stock';
      else if (isBm) path = `${opsBase}/branch-inventory`;
      else if (isSales) path = '/sales/inventory';
      break;

    case 'schedule':
      if (isCollector) path = '/collector/route';
      else if (isSales) path = '/sales/schedule';
      else if (isBm) path = `${opsBase}/field-operations`;
      else if (isOm) path = '/operating-manager/operations/field-operations';
      break;

    case 'purchase_request':
      if (isCustomer) path = '/customer/purchase-requests';
      else if (isSales) path = '/sales/purchase-requests';
      break;

    case 'security':
      if (isAdmin) path = '/super-admin/security';
      break;

    case 'approval':
      if (approvalBase) path = approvalBase;
      break;

    default:
      break;
  }

  if (!path) {
    if (cat.includes('overdue')) {
      if (isOm) path = '/operating-manager/saw-results';
      else if (isBm) path = `${opsBase}/reports/delinquency`;
      else if (isCustomer) path = '/customer/account-details';
    } else if (cat.includes('approval') && approvalBase) {
      path = approvalBase;
    } else if (cat.includes('alert')) {
      if (isOm) path = `${orgBase}/alerts`;
      else if (isBm) path = `${opsBase}/alerts`;
    } else if (cat.includes('schedule') || cat.includes('route') || cat.includes('assignment')) {
      if (isCollector) path = '/collector/route';
      else if (isSales) path = '/sales/schedule';
      else if (isBm) path = `${opsBase}/field-operations`;
    } else if (cat.includes('security') && isAdmin) {
      path = '/super-admin/security';
    } else if (cat.includes('user') && isAdmin) {
      path = '/super-admin/users';
    } else if (cat.includes('backup') && isAdmin) {
      path = '/super-admin/backup';
    } else if (cat.includes('stock') || cat.includes('inventory')) {
      if (isWarehouse) path = '/warehouse/branch-stock';
      else if (isBm) path = `${opsBase}/branch-inventory`;
    } else if (cat.includes('transfer')) {
      if (isWarehouse) path = '/warehouse/transfers';
      else if (approvalBase) path = withQuery(approvalBase, { tab: 'transfers' });
    } else if (cat.includes('restock')) {
      if (isWarehouse) path = '/warehouse/restock-history';
      else if (approvalBase) path = withQuery(approvalBase, { tab: 'restocks' });
    }
  }

  if (!path) return null;
  return {
    path,
    entity: entity || null,
    id: id || null,
  };
}

/**
 * Map API notification rows for UI + deep-links by role base path.
 */
export function mapNotificationRow(row, { opsBase = '/branch-manager', orgBase = '/operating-manager', roleKey = null } = {}) {
  const read = row.status === 'Read';
  const category = row.category || '';
  const cat = category.toLowerCase();
  const resolved = resolveNotificationNavigation(row, { roleKey, opsBase, orgBase });
  const relatedEntity = resolved?.entity || inferNotificationEntity(row) || null;
  const relatedId = resolved?.id || relatedIdOf(row);

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
    related_entity: relatedEntity,
    related_id: relatedId,
    relatedEntity,
    relatedId,
    relatedTo: resolved?.path || null,
    highlightId: relatedId || null,
  };
}

export function countUnreadNotifications(rows = []) {
  return rows.filter((row) => row.status !== 'Read' && !row.read).length;
}

export function resolveNotificationTargetForRole(row, roleKey) {
  if (!row || !roleKey) return null;
  if (row.relatedTo) return row.relatedTo;

  const bases = {
    collector: { opsBase: '/collector', orgBase: '/collector' },
    sales: { opsBase: '/sales', orgBase: '/sales' },
    warehouse: { opsBase: '/warehouse', orgBase: '/warehouse' },
    branchManager: { opsBase: '/branch-manager', orgBase: '/branch-manager' },
    operatingManager: { opsBase: '/operating-manager/operations', orgBase: '/operating-manager' },
    customer: { opsBase: '/customer', orgBase: '/customer' },
    superAdmin: { opsBase: '/super-admin', orgBase: '/super-admin' },
    admin: { opsBase: '/admin', orgBase: '/admin' },
  };
  const base = bases[roleKey] || {};
  const resolved = resolveNotificationNavigation(row, { roleKey, ...base });
  if (resolved?.path) return resolved.path;

  const fallbacks = {
    collector: '/collector/notifications',
    sales: '/sales/notifications',
    warehouse: '/warehouse/notifications',
    branchManager: '/branch-manager/notifications',
    operatingManager: '/operating-manager/notifications',
    customer: '/customer/notifications',
    superAdmin: '/super-admin/notifications',
    admin: '/admin/notifications',
  };
  return fallbacks[roleKey] || null;
}

export function resolveNotificationNavForRole(row, roleKey) {
  if (!row || !roleKey) return null;
  const bases = {
    collector: { opsBase: '/collector', orgBase: '/collector' },
    sales: { opsBase: '/sales', orgBase: '/sales' },
    warehouse: { opsBase: '/warehouse', orgBase: '/warehouse' },
    branchManager: { opsBase: '/branch-manager', orgBase: '/branch-manager' },
    operatingManager: { opsBase: '/operating-manager/operations', orgBase: '/operating-manager' },
    customer: { opsBase: '/customer', orgBase: '/customer' },
    superAdmin: { opsBase: '/super-admin', orgBase: '/super-admin' },
    admin: { opsBase: '/admin', orgBase: '/admin' },
  };
  const base = bases[roleKey] || {};
  if (row.relatedTo) {
    return {
      path: row.relatedTo,
      entity: row.relatedEntity || row.related_entity || inferNotificationEntity(row),
      id: row.relatedId || row.related_id || row.highlightId || extractNotificationRecordId(row),
    };
  }
  return resolveNotificationNavigation(row, { roleKey, ...base });
}
