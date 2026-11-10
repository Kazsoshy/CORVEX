/**
 * Rule-based Branch Pulse insights for the BM Dashboard.
 * Insights are derived only from loaded metrics — never invent "all healthy" on API failure.
 */

function fmtPct(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${Number(value)}%`;
}

/**
 * @param {{
 *   analytics: object|null,
 *   analyticsError?: boolean,
 *   alerts?: array,
 *   alertsError?: boolean,
 *   approvals?: object|null,
 *   approvalsError?: boolean,
 * }} input
 * @returns {Array<{ id: string, severity: string, text: string, actionLabel: string, href: string }>}
 */
export function buildBranchPulseInsights({
  analytics,
  analyticsError = false,
  alerts = [],
  alertsError = false,
  approvals = null,
  approvalsError = false,
  opsBase = '/branch-manager',
} = {}) {
  if (analyticsError) {
    return [{
      id: 'analytics-unavailable',
      severity: 'warning',
      text: 'Branch analytics are unavailable. Refresh or open Reports to verify performance.',
      actionLabel: 'Open Reports',
      href: `${opsBase}/reports`,
    }];
  }

  if (!analytics) return [];

  const insights = [];
  const collectionRate = analytics.collectionRate ?? analytics.collectionRateToday;
  const salesRate = analytics.salesEfficiency;
  const overdue = Number(analytics.overdueAccounts ?? analytics.overdueCount) || 0;
  const pendingCi = Number(approvals?.ci_pending ?? analytics.pendingCI ?? analytics.pendingCreditInvestigations) || 0;
  const stockAlerts = Number(analytics.stockAlertsCount ?? analytics.stockAlerts) || 0;
  const criticalAlerts = alertsError
    ? null
    : (alerts || []).filter((a) => a.severity === 'Critical').length;
  const collectorCompletion = analytics.collectorVisitCompletion ?? analytics.visitCompletionRate;
  const salesCompletion = analytics.salesVisitCompletion;
  const inventoryAttention = analytics.inventoryAttention || [];
  const hasCriticalStock = inventoryAttention.some((p) =>
    String(p.stockStatus || '').includes('Out') || String(p.stockStatus || '').includes('Critical')
  );
  const collectionsPoP = analytics.collectionsPeriodComparison;
  const missedVisits = Number(analytics.pendingFieldVisits?.missedOrOverdue) || 0;

  if (collectionRate != null && Number(collectionRate) < 100) {
    insights.push({
      id: 'collections-behind',
      severity: 'warning',
      text: `Collections are at ${fmtPct(collectionRate)} of the configured 7-day target. Review collection progress and overdue accounts.`,
      actionLabel: 'Collection Reports',
      href: `${opsBase}/reports/collection`,
    });
  } else if (collectionsPoP?.direction === 'down' && collectionsPoP.changePct != null) {
    insights.push({
      id: 'collections-down',
      severity: 'warning',
      text: `Collections are ${Math.abs(collectionsPoP.changePct)}% below the previous 7-day period. Review overdue accounts and collector completion.`,
      actionLabel: 'Field Ops',
      href: `${opsBase}/field-operations/collectors`,
    });
  }

  if (overdue > 0) {
    insights.push({
      id: 'overdue-accounts',
      severity: overdue >= 5 ? 'critical' : 'warning',
      text: `${overdue} overdue account${overdue === 1 ? '' : 's'} need attention${analytics.overdueExposure ? ` (₱${Number(analytics.overdueExposure).toLocaleString('en-PH', { maximumFractionDigits: 0 })} overdue exposure)` : ''}.`,
      actionLabel: 'Customers',
      href: `${opsBase}/customers`,
    });
  }

  if (!approvalsError && pendingCi > 0) {
    insights.push({
      id: 'pending-ci',
      severity: 'warning',
      text: `${pendingCi} credit investigation${pendingCi === 1 ? '' : 's'} waiting for a decision.`,
      actionLabel: 'Approval Center',
      href: `${opsBase}/approval-center`,
    });
  }

  if (hasCriticalStock || stockAlerts > 0) {
    insights.push({
      id: 'inventory-attention',
      severity: hasCriticalStock ? 'critical' : 'warning',
      text: hasCriticalStock
        ? 'Inventory stockouts or critical stock levels require branch follow-up.'
        : `${stockAlerts} monitored product${stockAlerts === 1 ? '' : 's'} need inventory attention.`,
      actionLabel: 'Branch Inventory',
      href: `${opsBase}/branch-inventory`,
    });
  }

  if (criticalAlerts != null && criticalAlerts > 0) {
    insights.push({
      id: 'critical-alerts',
      severity: 'critical',
      text: `${criticalAlerts} unresolved critical branch exception${criticalAlerts === 1 ? '' : 's'}.`,
      actionLabel: 'Alerts',
      href: `${opsBase}/alerts`,
    });
  }

  if (collectorCompletion == null && salesCompletion == null
    && Number(analytics.collectorVisitsTotal || 0) === 0
    && Number(analytics.salesVisitsTotal || 0) === 0) {
    insights.push({
      id: 'no-visits',
      severity: 'info',
      text: 'No assigned field visits are available for this 7-day period.',
      actionLabel: 'Field Ops',
      href: `${opsBase}/field-operations`,
    });
  } else if (missedVisits > 0) {
    insights.push({
      id: 'missed-visits',
      severity: 'warning',
      text: `${missedVisits} assigned visit${missedVisits === 1 ? '' : 's'} are past their scheduled date and still open.`,
      actionLabel: 'Field Ops',
      href: `${opsBase}/field-operations`,
    });
  } else if (
    (collectorCompletion != null && Number(analytics.collectorVisitsTotal) > 0
      && collectorCompletion < 100
      && Number(analytics.collectorVisitsCompleted) < Number(analytics.collectorVisitsTotal))
    || (salesCompletion != null && Number(analytics.salesVisitsTotal) > 0
      && salesCompletion < 100
      && Number(analytics.salesVisitsCompleted) < Number(analytics.salesVisitsTotal))
  ) {
    const colLabel = collectorCompletion == null ? null : `${collectorCompletion}% collector`;
    const salLabel = salesCompletion == null ? null : `${salesCompletion}% sales`;
    const parts = [colLabel, salLabel].filter(Boolean).join(' · ');
    insights.push({
      id: 'visit-completion-open',
      severity: 'info',
      text: `Field visit completion for this period: ${parts}. Open visits remain on the dispatch roster.`,
      actionLabel: 'Staff Performance',
      href: `${opsBase}/field-operations/performance`,
    });
  }

  if (salesRate != null && Number(salesRate) < 100) {
    insights.push({
      id: 'sales-behind',
      severity: 'info',
      text: `Sales revenue is at ${fmtPct(salesRate)} of the configured 7-day target.`,
      actionLabel: 'Sales Reports',
      href: `${opsBase}/reports/sales`,
    });
  }

  const actionable = insights.filter((i) => i.severity !== 'info');
  if (!actionable.length && !alertsError && !approvalsError) {
    return [{
      id: 'healthy',
      severity: 'ok',
      text: 'No critical operational exceptions detected for this branch from the loaded metrics.',
      actionLabel: 'View Reports',
      href: `${opsBase}/reports`,
    }];
  }

  const priority = { critical: 0, warning: 1, info: 2, ok: 3 };
  return insights
    .sort((a, b) => (priority[a.severity] ?? 9) - (priority[b.severity] ?? 9))
    .slice(0, 5);
}
