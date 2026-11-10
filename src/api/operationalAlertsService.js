import apiClient from './apiClient.js';

export async function fetchOperationalAlerts(params = {}) {
  try {
    const response = await apiClient.get('/operational-alerts', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch operational alerts:', error);
    return {
      success: false,
      data: [],
      message: error?.response?.data?.message || 'Failed to load alerts.',
    };
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
  const created = row.created_at || row.time || row.date;
  const ageMs = created ? Date.now() - new Date(created).getTime() : null;
  const ageHours = ageMs != null && Number.isFinite(ageMs) ? Math.max(0, Math.floor(ageMs / 3600000)) : null;
  let ageLabel = '—';
  if (ageHours != null) {
    if (ageHours < 24) ageLabel = `${ageHours}h`;
    else ageLabel = `${Math.floor(ageHours / 24)}d`;
  }

  return {
    id: row.alert_id,
    type: row.alert_type,
    category: row.category || row.alert_type,
    branch: row.branch_name || '—',
    branchId: row.branch_id,
    title: row.title,
    message: row.message,
    severity: row.severity,
    time: created,
    date: created,
    status: row.status,
    resolved: row.status === 'Resolved',
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name || null,
    assignedAt: row.assigned_at || null,
    resolvedAt: row.resolved_at || null,
    resolvedByName: row.resolved_by_name || null,
    resolutionNote: row.resolution_note || null,
    escalated: Boolean(row.escalated_at || row.escalated),
    escalatedAt: row.escalated_at || null,
    escalationReason: row.escalation_reason || null,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    linkPath: row.link_path || null,
    sourceKey: row.source_key || null,
    ageLabel,
  };
}

/** Build a deep-link path under the role ops base. */
export function alertDeepLink(alert, opsBase = '/branch-manager') {
  if (alert?.linkPath) {
    const path = String(alert.linkPath).replace(/^\//, '');
    return `${opsBase}/${path}`;
  }
  if (alert?.entityType === 'field_report' && alert.entityId) {
    return `${opsBase}/field-activity-reports/${alert.entityId}`;
  }
  if (alert?.entityType === 'product') {
    return `${opsBase}/branch-inventory`;
  }
  if (alert?.entityType === 'stock_count') {
    return `${opsBase}/approval-center`;
  }
  if (alert?.entityType === 'customer' && alert.entityId) {
    return `${opsBase}/customers/${alert.entityId}`;
  }
  const cat = String(alert?.category || alert?.type || '').toLowerCase();
  if (cat.includes('field')) return `${opsBase}/field-activity-reports`;
  if (cat.includes('inventor') || cat.includes('stock')) return `${opsBase}/branch-inventory`;
  if (cat.includes('delinquen') || cat.includes('collection')) return `${opsBase}/customers`;
  return null;
}
